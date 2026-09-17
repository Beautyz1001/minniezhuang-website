# 本地预览服务器。和 python -m http.server 一样，只多做一件事：
# 告诉浏览器「这些文件一律不要缓存」——不然改完 js 刷新页面还是旧的。
# 用法： python dev-server.py      然后访问 http://localhost:8788/
import functools
import http.server
import socketserver
from pathlib import Path
from urllib.parse import unquote, urlsplit

PORT = 8788
ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parents[1]
ARCHIVE_ROOT = (PROJECT_ROOT / "archive").resolve()
SITE_ROOT = (PROJECT_ROOT / "site").resolve()
PAGE_DIRECTORIES = frozenset({"home", "works", "break", "shared"})

class NoCache(http.server.SimpleHTTPRequestHandler):
    """Serve Home by default and the other first-party site pages by route."""

    def translate_path(self, path):
        requested_path = unquote(urlsplit(path).path).lstrip("/")

        # Home links use /archive/... after the browser normalizes ../../.
        # Resolve and verify the target before exposing anything outside Home.
        if requested_path == "archive" or requested_path.startswith("archive/"):
            archive_target = (PROJECT_ROOT / requested_path).resolve()
            if archive_target == ARCHIVE_ROOT or ARCHIVE_ROOT in archive_target.parents:
                return str(archive_target)

        # The server starts in site/home so Home can stay at the short URL
        # / (served as index.html). Cross-page links normalize to /works/…,
        # /break/… or /home/…, which must be resolved from site/ instead.
        page_directory = requested_path.split("/", 1)[0]
        if page_directory in PAGE_DIRECTORIES:
            site_target = (SITE_ROOT / requested_path).resolve()
            if site_target == SITE_ROOT or SITE_ROOT in site_target.parents:
                return str(site_target)

        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
handler = functools.partial(NoCache, directory=str(ROOT))
with socketserver.TCPServer(("", PORT), handler) as httpd:
    print(f"http://localhost:{PORT}/")
    httpd.serve_forever()
