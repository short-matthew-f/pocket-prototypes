#!/usr/bin/env python3
"""Local test server for the repo root: like `python3 -m http.server 8455`, but threaded with a deep listen queue so a
page's ~40 parallel asset requests aren't dropped (http.server's backlog of 5 makes Chrome lose images). Usage: python3 tools/serve.py [port]"""
import http.server, os, sys
class S(http.server.ThreadingHTTPServer): request_queue_size = 128
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
S(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8455), http.server.SimpleHTTPRequestHandler).serve_forever()
