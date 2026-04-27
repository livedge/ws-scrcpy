import * as http from 'http';
import express, { Express } from 'express';
import { Service } from './Service';
import { WebsocketProxyOverAdb } from '../goog-device/mw/WebsocketProxyOverAdb';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8001;

/**
 * Internal admin listener for ws-scrcpy. Bound to localhost only — never expose
 * over the network. The bot manager (same host) calls these endpoints to bounce
 * per-device sessions on demand.
 */
export class AdminServer implements Service {
    private static instance: AdminServer;
    private app?: Express;
    private server?: http.Server;
    private started = false;

    public static getInstance(): AdminServer {
        if (!AdminServer.instance) {
            AdminServer.instance = new AdminServer();
        }
        return AdminServer.instance;
    }

    public static hasInstance(): boolean {
        return !!AdminServer.instance;
    }

    public getName(): string {
        return 'Admin Server';
    }

    public async start(): Promise<void> {
        if (this.started) return;
        const host = process.env.WS_SCRCPY_ADMIN_HOST || DEFAULT_HOST;
        const portEnv = process.env.WS_SCRCPY_ADMIN_PORT;
        const port = portEnv ? parseInt(portEnv, 10) : DEFAULT_PORT;
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
            throw new Error(`AdminServer: invalid WS_SCRCPY_ADMIN_PORT="${portEnv}"`);
        }

        this.app = express();
        this.app.post('/sessions/:udid/kill', (req, res) => {
            const udid = req.params.udid;
            if (!udid) {
                res.status(400).json({ error: 'missing udid' });
                return;
            }
            const closed = WebsocketProxyOverAdb.closeAllForUdid(udid);
            res.status(204).set('X-Sessions-Closed', String(closed)).end();
        });

        await new Promise<void>((resolve, reject) => {
            this.server = http.createServer(this.app).listen(port, host, () => {
                console.log(`[AdminServer] listening on http://${host}:${port}`);
                resolve();
            });
            this.server.on('error', reject);
        });
        this.started = true;
    }

    public release(): void {
        this.server?.close();
    }
}
