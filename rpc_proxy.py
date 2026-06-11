#!/usr/bin/env python3
"""
Local HTTP proxy that forwards to Mantle Sepolia RPC using requests with pre-resolved IP.
Uses requests to handle SNI correctly via the Host header override trick.
"""
import http.server
import json
import socket
import ssl

TARGET_IP = "13.225.103.6"
TARGET_HOST = "rpc.sepolia.mantle.xyz"
LISTEN_PORT = 8545


def forward_rpc(body: bytes) -> bytes:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    sock = socket.create_connection((TARGET_IP, 443), timeout=30)
    ssock = ctx.wrap_socket(sock, server_hostname=TARGET_HOST)

    request = (
        f"POST / HTTP/1.1\r\n"
        f"Host: {TARGET_HOST}\r\n"
        f"Content-Type: application/json\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"Connection: close\r\n"
        f"\r\n"
    ).encode() + body

    ssock.sendall(request)

    response = b""
    while True:
        chunk = ssock.recv(4096)
        if not chunk:
            break
        response += chunk
    ssock.close()

    # Strip HTTP headers from response
    header_end = response.find(b"\r\n\r\n")
    if header_end == -1:
        return response
    return response[header_end + 4:]


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        try:
            resp_body = forward_rpc(body)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp_body)))
            self.end_headers()
            self.wfile.write(resp_body)
        except Exception as e:
            err = json.dumps({"error": str(e)}).encode()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)


if __name__ == "__main__":
    server = http.server.HTTPServer(("127.0.0.1", LISTEN_PORT), ProxyHandler)
    print(f"Proxy listening on http://127.0.0.1:{LISTEN_PORT}", flush=True)
    server.serve_forever()
