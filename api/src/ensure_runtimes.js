const logger = require('logplease').create('ensure-runtimes');
const path = require('path');
const fs = require('fs/promises');
const fss = require('fs');
const cp = require('child_process');
const util = require('util');
const crypto = require('crypto');
const Package = require('./package');
const runtime = require('./runtime');
const config = require('./config');
const globals = require('./globals');

const exec_file = util.promisify(cp.exec_file);
const MANIFEST_PATH = path.join(__dirname, 'learn_runtimes.json');
const PIP_MARKER = '.learn-pip-installed';

function err_msg(err) {
    if (!err) return 'unknown error';
    if (typeof err === 'string') return err;
    return err.message || String(err);
}

function packages_root() {
    return path.join(
        config.data_directory,
        globals.data_directories.packages
    );
}

function install_path(language, version) {
    return path.join(packages_root(), language, version);
}

function is_installed(language, version) {
    return fss.exists_sync(
        path.join(install_path(language, version), globals.pkg_installed_file)
    );
}

async function ensure_repo_package({ language, version }) {
    if (is_installed(language, version)) {
        logger.info(`Already installed: ${language}=${version}`);
        return;
    }

    // Clear partial failed installs (common on macOS bind mounts).
    const dest = install_path(language, version);
    if (fss.exists_sync(dest)) {
        logger.warn(`Removing incomplete ${language}=${version} at ${dest}`);
        try {
            await exec_file('rm', ['-rf', dest]);
        } catch (err) {
            logger.warn(`Could not clear ${dest}: ${err_msg(err)}`);
        }
    }

    logger.info(`Installing ${language}=${version} from package repo…`);
    const pkg = await Package.get_package(language, version);
    if (!pkg) {
        throw new Error(
            `Package ${language}=${version} not found in repo index (${config.repo_url})`
        );
    }
    await pkg.install();
    logger.info(`Installed ${language}=${version}`);
}

async function write_env_file(pkgdir) {
    const get_env_command = `cd ${pkgdir}; source environment; env`;
    const envout = await new Promise((resolve, reject) => {
        let stdout = '';
        const proc = cp.spawn(
            'env',
            ['-i', 'bash', '-c', `${get_env_command}`],
            { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        proc.stdout.on('data', data => {
            stdout += data;
        });
        proc.once('exit', code => {
            code === 0
                ? resolve(stdout)
                : reject(new Error('env failed'));
        });
        proc.once('error', reject);
    });

    const filtered_env = envout
        .split('\n')
        .filter(
            l =>
                !['PWD', 'OLDPWD', '_', 'SHLVL'].includes(l.split('=', 2)[0])
        )
        .join('\n');

    await fs.write_file(path.join(pkgdir, '.env'), filtered_env);
}

async function ensure_local_package({
    language,
    version,
    source,
    requires_binary,
}) {
    const dest = install_path(language, version);
    if (is_installed(language, version)) {
        logger.info(`Already installed (local): ${language}=${version}`);
        return;
    }

    if (!fss.exists_sync(source)) {
        logger.warn(
            `Skipping local ${language}=${version}: source missing at ${source}`
        );
        return;
    }

    if (
        requires_binary &&
        !fss.exists_sync(path.join(source, requires_binary))
    ) {
        logger.warn(
            `Skipping local ${language}=${version}: run packages/${language}/${version}/build.sh first (missing ${requires_binary})`
        );
        return;
    }

    logger.info(`Installing local ${language}=${version} from ${source}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    if (fss.exists_sync(dest)) {
        await exec_file('rm', ['-rf', dest]);
    }
    await fs.mkdir(dest, { recursive: true });
    // Node 15 image has no fs.cp — use system cp.
    await exec_file('cp', ['-a', `${source}/.`, dest]);

    const meta = JSON.parse(
        await fs.read_file(path.join(dest, 'metadata.json'), 'utf8')
    );
    meta.build_platform = globals.platform;
    await fs.write_file(
        path.join(dest, 'pkg-info.json'),
        JSON.stringify(meta, null, 2)
    );

    await write_env_file(dest);
    await fs.write_file(
        path.join(dest, globals.pkg_installed_file),
        Date.now().toString()
    );
    runtime.load_package(dest);
    logger.info(`Installed local ${language}=${version}`);
}

function python_pkg_dir() {
    const exact = install_path('python', '3.12.0');
    if (fss.exists_sync(path.join(exact, globals.pkg_installed_file))) {
        return exact;
    }
    const root = path.join(packages_root(), 'python');
    if (!fss.exists_sync(root)) return null;
    const versions = fss.readdir_sync(root).sort().reverse();
    for (const ver of versions) {
        const dir = path.join(root, ver);
        if (fss.exists_sync(path.join(dir, globals.pkg_installed_file))) {
            return dir;
        }
    }
    return null;
}

function pip_bin(pkgdir) {
    const candidates = [
        path.join(pkgdir, 'bin', 'pip3'),
        path.join(pkgdir, 'bin', 'pip'),
    ];
    return candidates.find(p => fss.exists_sync(p)) || null;
}

function python_bin(pkgdir) {
    const candidates = [
        path.join(pkgdir, 'bin', 'python3.12'),
        path.join(pkgdir, 'bin', 'python3'),
        path.join(pkgdir, 'bin', 'python'),
    ];
    return candidates.find(p => fss.exists_sync(p)) || null;
}

async function missing_pip_modules(py, modules) {
    const missing = [];
    for (const mod of modules) {
        const import_name =
            {
                pillow: 'PIL',
                beautifulsoup4: 'bs4',
                pyyaml: 'yaml',
                'python-dateutil': 'dateutil',
                pycryptodome: 'Crypto',
            }[mod] || mod;
        try {
            await exec_file(py, ['-c', `import ${import_name}`], {
                timeout: 60000,
                env: { ...process.env, MPLCONFIGDIR: '/tmp' },
            });
        } catch {
            missing.push(mod);
        }
    }
    return missing;
}

async function ensure_python_libs(pip_packages) {
    if (!pip_packages || pip_packages.length === 0) return;

    const pkgdir = python_pkg_dir();
    if (!pkgdir) {
        logger.warn('No python package installed; skipping pip libs');
        return;
    }

    const py = python_bin(pkgdir);
    const pip = pip_bin(pkgdir);
    if (!py || !pip) {
        logger.warn(`Python/pip binaries missing under ${pkgdir}`);
        return;
    }

    const req_hash = crypto
        .create_hash('sha256')
        .update(pip_packages.join('\n'))
        .digest('hex')
        .slice(0, 16);
    const marker = path.join(pkgdir, PIP_MARKER);

    const missing = await missing_pip_modules(py, pip_packages);
    if (
        missing.length === 0 &&
        fss.exists_sync(marker) &&
        (await fs.read_file(marker, 'utf8')).trim() === req_hash
    ) {
        logger.info('Python lesson libraries already present');
        return;
    }

    if (missing.length === 0) {
        await fs.write_file(marker, req_hash);
        logger.info('Python lesson libraries already importable');
        return;
    }

    logger.info(
        `Installing Python libs (${missing.length} missing): ${missing.join(', ')}`
    );
    await exec_file(
        pip,
        ['install', '--disable-pip-version-check', '--no-cache-dir', ...missing],
        {
            timeout: 600000,
            env: { ...process.env, MPLCONFIGDIR: '/tmp' },
            maxBuffer: 20 * 1024 * 1024,
        }
    );

    const still_missing = await missing_pip_modules(py, pip_packages);
    if (still_missing.length) {
        throw new Error(
            `pip install finished but still missing: ${still_missing.join(', ')}`
        );
    }

    await fs.write_file(marker, req_hash);
    logger.info('Python lesson libraries ready');
}

async function ensure_learn_runtimes() {
    if (!config.ensure_learn_runtimes) {
        logger.info('PISTON_ENSURE_LEARN_RUNTIMES disabled; skipping');
        return;
    }

    const manifest = JSON.parse(await fs.read_file(MANIFEST_PATH, 'utf8'));

    // Local packages first (godot) so a failed repo install cannot skip them.
    for (const pkg of manifest.local_packages || []) {
        try {
            await ensure_local_package(pkg);
        } catch (err) {
            logger.error(
                `Failed to ensure local ${pkg.language}=${pkg.version}:`,
                err_msg(err)
            );
        }
    }

    for (const pkg of manifest.packages || []) {
        try {
            await ensure_repo_package(pkg);
        } catch (err) {
            logger.error(
                `Failed to ensure ${pkg.language}=${pkg.version}:`,
                err_msg(err)
            );
        }
    }

    try {
        await ensure_python_libs(manifest.python_pip || []);
    } catch (err) {
        logger.error('Failed to ensure Python libs:', err_msg(err));
    }
}

module.exports = { ensure_learn_runtimes };
