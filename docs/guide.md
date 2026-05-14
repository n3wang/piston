# Piston-Lite: Setup, Usage & Maintenance Guide

A lightweight, Piston API-compatible code execution server supporting **C**, **C++**, and **Python**.
Built to run without Docker or root access, using the system's installed compilers.

- **API base URL:** `http://localhost:2000`
- **Server file:** `/home/claude-user/piston-lite/server.js`
- **Piston repo:** `/home/claude-user/piston/`

---

## Why piston-lite instead of the original Piston

The cloned `engineer-man/piston` (v3) depends on:
- **`isolate`** — a sandboxing tool that requires root privileges and kernel cgroup support
- **Docker** — to pull the pre-built image (`ghcr.io/engineer-man/piston`)

Neither was available in this environment (`claude-user` is not in the `docker` group and `uidmap`/`newuidmap` are not installed). `piston-lite` replicates the full Piston v2 API surface (`/api/v2/runtimes` and `/api/v2/execute`) using the host's `gcc`, `g++`, and `python3`.

---

## Environment

| Component | Version |
|---|---|
| OS | Debian 6.12.63 (amd64) |
| Node.js | v20.19.2 |
| gcc / g++ | 14.2.0 |
| Python | 3.13.5 |

---

## Getting Started

### Start the server

```bash
cd /home/claude-user/piston-lite
node server.js &
```

The server binds to `0.0.0.0:2000`. You should see:

```
Piston-lite API running on http://0.0.0.0:2000
Runtimes: C (gcc 14.2.0), C++ (g++ 14.2.0), Python (3.13.5)
```

### Start on a custom port

```bash
PORT=3000 node server.js &
```

### Verify the server is running

```bash
curl http://localhost:2000/
```

Expected response:
```json
{"message":"Piston-lite v1.0.0 (C, C++, Python)"}
```

---

## Restart & Stop

### Find the running process

```bash
lsof -i :2000
# or
ps aux | grep "node server.js"
```

### Stop the server

```bash
kill $(lsof -t -i :2000)
```

### Restart

```bash
kill $(lsof -t -i :2000) 2>/dev/null; sleep 1
cd /home/claude-user/piston-lite && node server.js &
```

### Run in foreground (useful for debugging)

```bash
cd /home/claude-user/piston-lite
node server.js
```

---

## Keep alive with nohup

```bash
cd /home/claude-user/piston-lite
nohup node server.js > /tmp/piston-lite.log 2>&1 &
echo "PID: $!"
```

Tail the log:

```bash
tail -f /tmp/piston-lite.log
```

---

## API Reference

### GET /api/v2/runtimes

List all available language runtimes.

```bash
curl http://localhost:2000/api/v2/runtimes
```

Response:
```json
[
  {"language":"c",      "version":"14.2.0","aliases":["gcc"],                  "runtime":"gcc"},
  {"language":"c++",    "version":"14.2.0","aliases":["cpp","g++","cxx"],      "runtime":"gcc"},
  {"language":"python", "version":"3.13.5","aliases":["py","py3","python3","python3.13"]}
]
```

### POST /api/v2/execute

Execute code. Request body fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `language` | string | yes | Language name or alias |
| `version` | string | no | Version prefix (e.g. `"3"`, `"14"`, `"*"`) |
| `files` | array | yes | Array of `{name, content, encoding}` objects |
| `stdin` | string | no | Standard input to pass to the program |
| `args` | array | no | Command-line arguments |
| `run_timeout` | number | no | Max run time in ms (default: 3000) |
| `compile_timeout` | number | no | Max compile time in ms (default: 10000) |

---

## Sample Tests

### Python

**Basic output:**
```bash
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "python",
    "version": "3",
    "files": [{"name": "main.py", "content": "print(\"Hello from Python!\")"}]
  }'
```

Expected:
```json
{
  "language": "python",
  "version": "3.13.5",
  "compile": null,
  "run": {
    "stdout": "Hello from Python!\n",
    "stderr": "",
    "output": "Hello from Python!\n",
    "code": 0,
    "signal": null,
    "message": null,
    "status": null
  }
}
```

**With stdin:**
```bash
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "python",
    "version": "3",
    "stdin": "Alice",
    "files": [{"name": "main.py", "content": "name = input()\nprint(f\"Hello, {name}!\")"}]
  }'
```

**Math / computation:**
```bash
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "py",
    "files": [{"name": "fib.py", "content": "n=10\na,b=0,1\nfor _ in range(n):\n    print(a,end=\" \")\n    a,b=b,a+b"}]
  }'
```

---

### C

**Hello World:**
```bash
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "c",
    "version": "14",
    "files": [{"name": "main.c", "content": "#include <stdio.h>\nint main() {\n    printf(\"Hello from C!\\n\");\n    return 0;\n}"}]
  }'
```

Expected:
```json
{
  "language": "c",
  "version": "14.2.0",
  "compile": {
    "stdout": "", "stderr": "", "output": "", "code": 0,
    "signal": null, "message": null, "status": null
  },
  "run": {
    "stdout": "Hello from C!\n",
    "stderr": "",
    "output": "Hello from C!\n",
    "code": 0,
    "signal": null,
    "message": null,
    "status": null
  }
}
```

**Using a file (recommended for multiline code):**
```bash
cat > /tmp/payload_c.json << 'EOF'
{
  "language": "c",
  "files": [{
    "name": "main.c",
    "content": "#include <stdio.h>\n#include <math.h>\nint main() {\n    printf(\"sqrt(2) = %.6f\\n\", sqrt(2.0));\n    return 0;\n}"
  }]
}
EOF
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d @/tmp/payload_c.json
```

**Compile error example:**
```bash
cat > /tmp/payload_c_err.json << 'EOF'
{
  "language": "c",
  "files": [{"name": "bad.c", "content": "int main() { return }"}]
}
EOF
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d @/tmp/payload_c_err.json
```

---

### C++

**Hello World:**
```bash
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "c++",
    "version": "14",
    "files": [{"name": "main.cpp", "content": "#include <iostream>\nint main() {\n    std::cout << \"Hello from C++!\" << std::endl;\n    return 0;\n}"}]
  }'
```

Expected:
```json
{
  "language": "c++",
  "version": "14.2.0",
  "compile": {
    "stdout": "", "stderr": "", "output": "", "code": 0,
    "signal": null, "message": null, "status": null
  },
  "run": {
    "stdout": "Hello from C++!\n",
    "stderr": "",
    "output": "Hello from C++!\n",
    "code": 0,
    "signal": null,
    "message": null,
    "status": null
  }
}
```

**Using alias `cpp`:**
```bash
cat > /tmp/payload_cpp.json << 'EOF'
{
  "language": "cpp",
  "files": [{
    "name": "main.cpp",
    "content": "#include <iostream>\n#include <vector>\n#include <algorithm>\nint main() {\n    std::vector<int> v = {5,3,1,4,2};\n    std::sort(v.begin(), v.end());\n    for (int x : v) std::cout << x << \" \";\n    std::cout << std::endl;\n    return 0;\n}"
  }]
}
EOF
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d @/tmp/payload_cpp.json
```

**With command-line args:**
```bash
cat > /tmp/payload_cpp_args.json << 'EOF'
{
  "language": "c++",
  "args": ["Alice", "Bob"],
  "files": [{
    "name": "main.cpp",
    "content": "#include <iostream>\nint main(int argc, char* argv[]) {\n    for (int i = 1; i < argc; i++)\n        std::cout << \"Hello, \" << argv[i] << \"!\\n\";\n    return 0;\n}"
  }]
}
EOF
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d @/tmp/payload_cpp_args.json
```

---

## Interactive Mode (CLI + WebSocket)

The Piston CLI (`piston execute` / `piston run`) has an `--interactive` flag (`-t`) that opens a **persistent WebSocket connection** to `/api/v2/connect` instead of using the REST endpoint. This allows real-time, bidirectional communication — stdin is streamed live as the program runs, making it suitable for programs that call `input()`, `scanf`, or `cin >>` repeatedly.

> **Note:** Interactive mode requires a full Piston server (with WebSocket support at `/api/v2/connect`). `piston-lite` only implements the REST API — see [Simulating interactive input via REST](#simulating-interactive-input-via-rest) below for the equivalent approach without WebSocket.

---

### CLI usage

```bash
# Basic interactive run
piston execute python main.py --interactive

# Short flags
piston run python main.py -t

# With status messages printed to stderr
piston run python main.py -t --status

# With a specific language version
piston run python main.py -t --language_version 3.13

# Interactive C++ with extra files
piston run c++ main.cpp -t -f helper.cpp
```

Flag reference:

| Flag | Alias | Description |
|---|---|---|
| `--interactive` | `-t` | Use WebSocket transport (real-time stdin/stdout) |
| `--stdin` | `-i` | (non-interactive) read all stdin then send it |
| `--status` | `-s` | Print stage/connection events to stderr |
| `--language_version` | `-l` | Pin a language version (default: `*`) |
| `--run_timeout` | `-r`, `--rt` | Ms before killing the run process (default: 3000) |
| `--compile_timeout` | `-c`, `--ct` | Ms before killing the compile process (default: 10000) |
| `--files` | `-f` | Additional source files to include |

---

### WebSocket protocol (what the CLI does under the hood)

The CLI connects to `ws://<host>/api/v2/connect` and exchanges JSON frames.

**1. Client sends `init` to start execution:**
```json
{
  "type": "init",
  "language": "python",
  "version": "*",
  "files": [
    { "name": "main.py", "content": "name = input('Name: ')\nprint(f'Hello, {name}!')", "encoding": "utf8" }
  ],
  "args": [],
  "compile_timeout": 10000,
  "run_timeout": 3000
}
```

**2. Server replies with runtime info:**
```json
{ "type": "runtime", "language": "python", "version": "3.13.5" }
```

**3. Server announces the current stage:**
```json
{ "type": "stage", "stage": "run" }
```
For compiled languages, `"stage": "compile"` comes first, then `"stage": "run"`.

**4. Server streams output:**
```json
{ "type": "data", "stream": "stdout", "data": "Name: " }
```

**5. Client sends user input live:**
```json
{ "type": "data", "stream": "stdin", "data": "Alice\n" }
```

**6. Server streams the response output:**
```json
{ "type": "data", "stream": "stdout", "data": "Hello, Alice!" }
```

**7. Server sends exit event:**
```json
{ "type": "exit", "stage": "run", "code": 0, "signal": null }
```

**Sending a signal to the running process:**
```json
{ "type": "signal", "signal": "SIGTERM" }
```

---

### Interactive examples: Python `input()`

#### Single input
`greet.py`:
```python
name = input("Enter your name: ")
print(f"Hello, {name}! Welcome to Piston.")
```

Run interactively:
```bash
piston run python greet.py -t -s
```

Session flow:
```
[stderr] Connected
[stderr] Stage: run
Enter your name: Alice          ← you type this
Hello, Alice! Welcome to Piston.
[stderr] Stage run exited with code 0
```

---

#### Multiple sequential inputs
`calculator.py`:
```python
a = float(input("First number: "))
b = float(input("Second number: "))
op = input("Operation (+, -, *, /): ")

if op == '+':   print(f"Result: {a + b}")
elif op == '-': print(f"Result: {a - b}")
elif op == '*': print(f"Result: {a * b}")
elif op == '/': print(f"Result: {a / b}" if b != 0 else "Error: division by zero")
else:           print("Unknown operation")
```

```bash
piston run python calculator.py -t
# Type: 10  →  Enter
# Type: 4   →  Enter
# Type: *   →  Enter
# Output: Result: 40.0
```

---

#### Loop-driven input (until quit)
`echo_loop.py`:
```python
while True:
    line = input()
    if line.lower() == "quit":
        print("Goodbye!")
        break
    print(f"Echo: {line}")
```

```bash
piston run python echo_loop.py -t
# Type: hello  → Echo: hello
# Type: world  → Echo: world
# Type: quit   → Goodbye!
```

---

#### Interactive C — `scanf`
`add.c`:
```c
#include <stdio.h>
int main() {
    int a, b;
    printf("Enter two integers: ");
    scanf("%d %d", &a, &b);
    printf("Sum: %d\n", a + b);
    return 0;
}
```

```bash
piston run c add.c -t
# Type: 7 13  → Enter
# Output: Sum: 20
```

---

#### Interactive C++ — `cin`
`quiz.cpp`:
```cpp
#include <iostream>
#include <string>
int main() {
    std::string answer;
    std::cout << "What is the capital of France? ";
    std::getline(std::cin, answer);
    if (answer == "Paris")
        std::cout << "Correct!\n";
    else
        std::cout << "Wrong. The answer is Paris.\n";
    return 0;
}
```

```bash
piston run c++ quiz.cpp -t
# Type: Paris  → Correct!
```

---

### Simulating interactive input via REST

When using `piston-lite` (or any scenario without WebSocket), pass all stdin upfront as a newline-separated string in the `stdin` field. The program receives it as if the user typed it sequentially.

**Python `input()` with multiple prompts:**
```bash
cat > /tmp/calc.json << 'EOF'
{
  "language": "python",
  "stdin": "10\n4\n*\n",
  "files": [{
    "name": "calculator.py",
    "content": "a = float(input('First: '))\nb = float(input('Second: '))\nop = input('Op: ')\nif op == '*': print(f'Result: {a * b}')"
  }]
}
EOF
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d @/tmp/calc.json
```

Expected output:
```json
{
  "run": {
    "stdout": "First: Second: Op: Result: 40.0\n",
    "code": 0
  }
}
```

> The prompts (`First:`, `Second:`, `Op:`) appear inline because there is no TTY — `input()` writes the prompt to stdout but reads from the pre-supplied stdin string.

**C `scanf` with pre-supplied stdin:**
```bash
cat > /tmp/add.json << 'EOF'
{
  "language": "c",
  "stdin": "7 13\n",
  "files": [{
    "name": "add.c",
    "content": "#include <stdio.h>\nint main() {\n    int a, b;\n    scanf(\"%d %d\", &a, &b);\n    printf(\"Sum: %d\\n\", a + b);\n    return 0;\n}"
  }]
}
EOF
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d @/tmp/add.json
```

**Multi-line C++ `cin` loop:**
```bash
cat > /tmp/echo.json << 'EOF'
{
  "language": "c++",
  "stdin": "hello\nworld\nquit\n",
  "files": [{
    "name": "echo.cpp",
    "content": "#include <iostream>\n#include <string>\nint main() {\n    std::string line;\n    while (std::getline(std::cin, line)) {\n        if (line == \"quit\") break;\n        std::cout << \"Echo: \" << line << \"\\n\";\n    }\n    return 0;\n}"
  }]
}
EOF
curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d @/tmp/echo.json
```

Expected:
```json
{ "run": { "stdout": "Echo: hello\nEcho: world\n", "code": 0 } }
```

---

## Maintenance

### Check server health

```bash
curl -s http://localhost:2000/ | python3 -m json.tool
```

### Check available runtimes

```bash
curl -s http://localhost:2000/api/v2/runtimes | python3 -m json.tool
```

### Check port usage

```bash
lsof -i :2000
```

### Monitor resource usage

```bash
ps aux | grep "node server.js" | grep -v grep
```

### View logs (if started with nohup)

```bash
tail -100 /tmp/piston-lite.log
tail -f /tmp/piston-lite.log        # live follow
```

### Clean up leftover temp files

The server cleans up job temp dirs automatically after each request. If the server crashed mid-execution, orphaned dirs may remain:

```bash
ls /tmp/piston-* 2>/dev/null
rm -rf /tmp/piston-*
```

---

## Upgrading to full Piston (with Docker)

If Docker access becomes available (`claude-user` added to the `docker` group) and `uidmap` is installed:

```bash
# Add user to docker group (requires root)
sudo usermod -aG docker claude-user
newgrp docker

# Install uidmap for rootless Docker support (requires root)
sudo apt-get install -y uidmap

# Start the official Piston container
cd /home/claude-user/piston
docker compose up -d

# Install language packages via ppman CLI
docker exec piston_api ppman install python
docker exec piston_api ppman install gcc        # provides C and C++
docker exec piston_api ppman install nodejs
```

The official container exposes the same API on port `2000`, so all curl commands in this guide work unchanged.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `address already in use :2000` | `kill $(lsof -t -i :2000)` then restart |
| `connect: connection refused` | Server isn't running — start it with `node server.js &` |
| Compile error on valid code | Check the `compile.stderr` field in the response for gcc/g++ output |
| Timeout on long-running code | Pass `"run_timeout": 10000` (ms) in the request body |
| Server crashes / no response | Check `/tmp/piston-lite.log` or restart in foreground for visible errors |
