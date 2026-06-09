import http.server
import socketserver
import urllib.request
import urllib.error
import json
import sys

PORT = 5000

class AIMSSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/models':
            try:
                # Extract api key from client request headers
                api_key = self.headers.get('Authorization', '')
                
                # Forward request to NVIDIA models endpoint
                req = urllib.request.Request(
                    'https://integrate.api.nvidia.com/v1/models',
                    headers={
                        'Authorization': api_key
                    },
                    method='GET'
                )
                
                with urllib.request.urlopen(req, timeout=15) as response:
                    res_data = response.read()
                    self.send_response(response.status)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(res_data)
                    
            except urllib.error.HTTPError as e:
                # Pass back API errors safely
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(e.read())
            except Exception as e:
                # Generic internal errors
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/ai':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length) if content_length > 0 else b''
                
                # Extract api key from client request headers
                api_key = self.headers.get('Authorization', '')
                
                # Forward request to NVIDIA/Gemini API
                req = urllib.request.Request(
                    'https://integrate.api.nvidia.com/v1/chat/completions',
                    data=post_data,
                    headers={
                        'Content-Type': 'application/json',
                        'Authorization': api_key
                    },
                    method='POST'
                )
                
                with urllib.request.urlopen(req, timeout=120) as response:
                    res_data = response.read()
                    self.send_response(response.status)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(res_data)
                    
            except urllib.error.HTTPError as e:
                # Pass back API errors safely
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(e.read())
            except Exception as e:
                # Generic internal errors
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        else:
            # Fall back to default handler for other POST requests if any
            super().do_POST()

    def do_OPTIONS(self):
        # Support CORS preflight requests
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

# Use proper binding to allow port reuse
class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    # Force UTF-8 stdout if needed
    sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None
    
    Handler = AIMSSRequestHandler
    with ThreadedTCPServer(("", PORT), Handler) as httpd:
        print(f"AIMSS Safe Proxy Server running at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
