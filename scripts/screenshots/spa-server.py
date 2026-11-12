"""Static file server with single-page-app fallback (unknown paths return index.html)."""
import http.server, os, sys

root, port = sys.argv[1], int(sys.argv[2])
os.chdir(root)

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.translate_path(self.path.split("?")[0])
        if not os.path.exists(path) or os.path.isdir(path) and not os.path.exists(os.path.join(path, "index.html")):
            self.path = "/index.html"
        return super().do_GET()
    def log_message(self, *a):
        pass

http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
