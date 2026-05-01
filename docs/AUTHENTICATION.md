# Authentication

This prototype includes optional password-based authentication to control access.

## Configuration

Authentication is controlled by environment variables:

### Enable/Disable Authentication

- **`REQUIRE_AUTH`** - Set to `true` to enable authentication (default: `false`)
- **`PROTOTYPE_PASSWORD`** - The password required to access the site (default: `prototype`)

## Usage

### Local Development (No Authentication)

By default, authentication is disabled for local development:

```bash
npm start
```

### External/Production Environment (With Authentication)

To enable authentication, set the environment variable:

```bash
REQUIRE_AUTH=true npm start
```

Or add to your `.env` file:

```env
REQUIRE_AUTH=true
PROTOTYPE_PASSWORD=your-secure-password
```

### Environment-Specific Configuration

You can enable authentication only for specific environments:

**Option 1: Using ENVIRONMENT variable**

In your deployment configuration, set:
```env
ENVIRONMENT=production
REQUIRE_AUTH=true
PROTOTYPE_PASSWORD=your-password
```

**Option 2: Using different .env files**

- `.env` (local development - auth disabled)
- `.env.production` (production - auth enabled)

## How It Works

When `REQUIRE_AUTH=true`:

1. All routes except `/login`, `/logout`, `/health`, and static assets are protected
2. Unauthenticated users are redirected to `/login`
3. Users must enter the password to access the site
4. Sessions are stored in encrypted cookies
5. Sessions persist until the user logs out or the cookie expires

## Routes

- **`/login`** - The login page (only visible when auth is enabled)
- **`/logout`** - Clears the session and redirects to login

## Security Notes

- The password is stored as a plain environment variable
- Sessions use encrypted cookies (@hapi/yar)
- This is intended for prototype/demo purposes only
- For production applications, implement proper authentication (OAuth, SSO, etc.)

## Testing

Tests automatically enable authentication via the test configuration in `vitest.config.js`.
