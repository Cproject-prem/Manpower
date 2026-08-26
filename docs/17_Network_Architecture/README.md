# 17 - Network Architecture & Infrastructure Topography

## Topology Diagram

```mermaid
graph LR
    subgraph External Network
        UserBrowser[Client Web Browser]
    end

    subgraph Perimeter / DMZ
        FW[Firewall / WAF]
        NGINX[NGINX Reverse Proxy & SSL Termination]
    end

    subgraph Application Subnet (Private)
        AppAPI[FastAPI Application Server :8001]
    end

    subgraph Data Subnet (Private Isolated)
        MongoDB[(MongoDB Cluster :27017)]
        LocalFS[Local Storage /uploads]
        FTPServer[FTP Storage Backup Server]
    end

    UserBrowser -->|HTTPS :443| FW
    FW --> NGINX
    NGINX -->|HTTP Proxy :8001| AppAPI
    AppAPI -->|Motor Driver| MongoDB
    AppAPI -->|File I/O| LocalFS
    AppAPI -->|Async Backup| FTPServer
```

---

## Network Security Controls
- **Internal Binding**: FastAPI server binds internally to localhost or private container network interface (`0.0.0.0:8001` behind NGINX).
- **TLS Termination**: SSL/TLS termination performed at NGINX proxy using TLS 1.3/1.2 ciphers.
- **Port Isolation**: MongoDB port (`27017`) blocked from public WAN access; accessible only within private subnet.
