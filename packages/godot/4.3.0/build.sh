#!/usr/bin/env bash

curl -L "https://github.com/godotengine/godot/releases/download/4.3-stable/Godot_v4.3-stable_linux.x86_64.zip" -o godot.zip

unzip -o godot.zip
rm godot.zip

mv Godot_v4.3-stable_linux.x86_64 godot
chmod +x godot
