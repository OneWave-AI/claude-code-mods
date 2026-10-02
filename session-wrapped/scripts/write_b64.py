#!/usr/bin/env python3
"""Decode base64 from stdin and write the bytes to the path given as the only argument.

session-wrapped uses this to save its PNG card where the system `base64` tool has no -o flag
(Linux). Reads only stdin, writes only the one file it is told to.
"""
import base64
import sys

with open(sys.argv[1], "wb") as out:
    out.write(base64.b64decode(sys.stdin.read()))
