import http from "http";
import https from "https";
import { URL } from "url";

export interface ApiRequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    timeoutMs?: number;
}

export async function sendApiRequest<T = any>(urlStr: string, options: ApiRequestOptions = {}): Promise<T> {
    const url = new URL(urlStr);
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    const method = (options.method || "GET").toUpperCase();
    const headers = { ...options.headers };
    let postData: string | undefined;

    if (options.body) {
        postData = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
        headers["Content-Length"] = Buffer.byteLength(postData).toString();
    }

    return new Promise((resolve, reject) => {
        const req = transport.request(url, {
            method,
            headers,
            timeout: options.timeoutMs || 10000
        }, (res) => {
            let data = "";
            res.on("data", chunk => { data += chunk; });
            res.on("end", () => {
                if ((res.statusCode || 200) >= 400) {
                    return reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
                }
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch {
                    resolve(data as any);
                }
            });
        });

        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy();
            reject(new Error(`API request timed out after ${options.timeoutMs || 10000}ms`));
        });

        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}
