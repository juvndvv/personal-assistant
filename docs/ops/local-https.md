# Local HTTPS

The app is always served over HTTPS, also locally: Sanctum session cookies are `Secure`, and the
browser only exposes the microphone, the camera and PWA installation in a secure context. In
development FrankenPHP (Caddy) issues certificates from its own local certificate authority
(`tls internal` in `docker/frankenphp/Caddyfile.dev`).

The CA lives in the `caddy_data` volume:

```
/data/caddy/pki/authorities/local/root.crt           # root certificate to trust (valid ~10 years)
/data/caddy/pki/authorities/local/intermediate.crt   # rotated automatically by Caddy
```

Keep the `caddy_data` volume. `docker compose down -v` deletes it, Caddy then creates a new CA and
every device has to trust the new root again.

## 1. Serve the hostnames your devices use

`SERVER_NAME` in `.env` is the list of site addresses Caddy issues certificates for. Add the LAN IP,
the mDNS name and/or the Tailscale MagicDNS name of the machine running the stack:

```dotenv
SERVER_NAME="localhost, 192.168.1.20, my-mac.local, my-mac.tail1234.ts.net"
APP_URL=https://my-mac.tail1234.ts.net
SANCTUM_STATEFUL_DOMAINS=localhost,192.168.1.20,my-mac.local,my-mac.tail1234.ts.net
```

Every hostname used from a browser must be in `SANCTUM_STATEFUL_DOMAINS` (with `:port` when the
HTTPS port is not 443), otherwise login works but the session is not recognised. Apply the change
with `docker compose up -d web`.

Find the addresses with `ipconfig getifaddr en0` (macOS LAN IP) and `tailscale status` (tailnet
name). Prefer Tailscale: the name is stable, works away from home and nothing is exposed to the LAN.
On macOS, allow incoming connections for Docker/OrbStack if the firewall asks.

## 2. Export the root certificate

```bash
make trust-ca
```

This copies the root certificate to `.caddy/root.crt` (git-ignored) and, on macOS, adds it to the
login keychain as a trusted root. On Linux, install it with your distribution's trust tool (for
example `sudo cp .caddy/root.crt /usr/local/share/ca-certificates/caddy-local.crt && sudo
update-ca-certificates`). Firefox keeps its own store: import it in Settings > Privacy & Security >
Certificates.

## 3. Trust it on iOS / iPadOS

1. Send `.caddy/root.crt` to the device (AirDrop, Files, or e-mail). Do not use a link served by the
   untrusted site itself.
2. Open it and confirm: iOS shows "Profile Downloaded".
3. Settings > General > VPN & Device Management > the "Caddy Local Authority" profile > Install.
4. Settings > General > About > Certificate Trust Settings > enable full trust for "Caddy Local
   Authority". Without this step Safari still rejects the certificate.
5. Open `https://<hostname>` in Safari, log in, then Share > Add to Home Screen to install the PWA.

## 4. Trust it on Android

1. Copy `.caddy/root.crt` to the device.
2. Settings > Security & privacy > More security settings > Encryption & credentials > Install a
   certificate > CA certificate (menu names vary by vendor), and select the file.
3. Open `https://<hostname>` in Chrome and install the app from the menu (Install app / Add to Home
   screen). Chrome trusts user-installed CAs; other apps may not, which does not affect the PWA.

## 5. Check

- `https://<hostname>/up` answers 200 without a certificate warning.
- Login keeps the session after a reload.
- The capture screen can access the microphone and the camera (permission prompt appears).

## Production

`docker/frankenphp/Caddyfile` (production) does not force `tls internal`: with a public domain in
`SERVER_NAME`, Caddy obtains Let's Encrypt certificates automatically. For a host reachable only over
Tailscale, either keep the internal CA (set `CADDY_SERVER_EXTRA_DIRECTIVES="tls internal"` and trust
the root as above) or use Tailscale HTTPS certificates for the `*.ts.net` name.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Certificate warning on the phone only | Step 4 of iOS (full trust) is missing, or the CA was recreated after `down -v`. |
| `ERR_SSL_PROTOCOL_ERROR` on an IP or name | That address is not in `SERVER_NAME`; add it and restart `web`. |
| Login returns 200 but the next request is 401 | The hostname (and port) is missing from `SANCTUM_STATEFUL_DOMAINS`. |
| 419 on login | Stale `XSRF-TOKEN` cookie from another host; reload the page. |
