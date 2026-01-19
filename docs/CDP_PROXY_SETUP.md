# CDP Proxy Setup Guide

## Problem
When deployed to CDP, the application received **407 Proxy Authentication Required** errors:

```
RequestAbortedError [AbortError]: Proxy response (407) !== 200 when HTTP Tunneling
```

## Solution
Add `environment.data.gov.uk` to your service's Access Control List (ACL) in the [cdp-tenant-config](https://github.com/DEFRA/cdp-tenant-config) repository.

## Steps to Configure

### 1. Fork and Edit cdp-tenant-config

```bash
# Fork the repository
https://github.com/DEFRA/cdp-tenant-config

# Edit the ACL file for your service and environment
# Location: environments/<env>/squid/<your-service-name>.json
# Example: environments/dev/squid/cff-chart-prototype.json
```

### 2. Add Domain to ACL

```json
{
  "allowed_domains": [
    "environment.data.gov.uk"
  ]
}
```

**Using wildcards** to allow all subdomains:
```json
{
  "allowed_domains": [
    ".data.gov.uk"
  ]
}
```

### 3. Create Pull Request

1. Raise PR from your fork
2. Post link in **#cdp-support** Slack channel  
3. CDP team reviews and merges
4. Changes deploy automatically

## Testing

### Health Check Endpoint
```bash
curl https://cff-chart-prototype.dev.cdp-int.defra.cloud/health/connectivity
```

### CDP Terminal Test
```bash
nc -x 127.0.0.1:3128 -X connect -vz environment.data.gov.uk 443
```

**Success:**
```
Connection to environment.data.gov.uk 443 port [tcp/https] succeeded!
```

**Failure (not in ACL):**
```
nc: Proxy error: "HTTP/1.1 307 Temporary Redirect"
```

## How CDP Proxy Works

1. CDP injects `HTTP_PROXY=http://localhost:3128` into all containers
2. Application uses ProxyAgent for all external requests
3. Proxy checks domain against service's ACL configuration
4. If allowed → connection succeeds
5. If not allowed → returns 407 or 307 error

## Log Messages

✅ **Working correctly:**
```
Fetching station from: https://environment.data.gov.uk/...
Station API response status: 200 OK
Station data retrieved successfully
```

❌ **Domain not in ACL:**
```
Proxy response (407) !== 200 when HTTP Tunneling
Error fetching station from https://environment.data.gov.uk/...
```

## Resources

- [CDP Proxy Documentation](https://portal.cdp-int.defra.cloud/documentation/how-to/proxy.md)
- [cdp-tenant-config Repository](https://github.com/DEFRA/cdp-tenant-config)
- [View Your Proxy Config](https://portal.cdp-int.defra.cloud/) → Services → Your Service → Proxy tab
