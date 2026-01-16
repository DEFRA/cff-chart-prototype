# CFF Chart Prototype

A prototype designed for use in user research for testing out different charts and the data they display

## Requirements

- Node.js ≥ v22
- npm ≥ v9

It's recommended to use [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions.

To use the correct version of Node.js for this application, via nvm:

```bash
cd cff-chart-prototype
nvm use
```

## Server-side Caching

By default, the service uses in-memory caching for local development. If your application requires a shared session cache between instances or persistence across restarts, you can integrate Redis by setting the `SESSION_CACHE_ENGINE` environment variable to `redis`. For local development without Redis, ensure that `SESSION_CACHE_ENGINE` is set to `memory`.

## Proxy Configuration

The application is configured to use a forward proxy by default. To utilize this proxy in your HTTP requests, you can set up the dispatcher as follows:

```javascript
import { ProxyAgent } from 'undici';

const agent = new ProxyAgent({ uri: process.env.PROXY_URL });
const response = await fetch(url, { dispatcher: agent });
```

Ensure that `PROXY_URL` is set in your environment variables.

## Local Development

### Setup

Install application dependencies:

```bash
npm install
```

### Development Mode

To run the application in development mode:

```bash
npm run dev
```

### Production Mode

To run the application in production mode locally:

```bash
npm start
```

### NPM Scripts

To view all available npm scripts:

```bash
npm run
```

### Update Dependencies

To update dependencies using `npm-check-updates`:

```bash
npx npm-check-updates -u
npm install
```

### Formatting

Ensure consistent code formatting:

```bash
npm run format
```

If you encounter issues with line endings on Windows, update your global git config:

```bash
git config --global core.autocrlf false
```

## Docker

### Development Image

Build the development image:

```bash
docker build --target development --no-cache --tag cff-chart-prototype:development .
```

Run the development container:

```bash
docker run -p 3000:3000 cff-chart-prototype:development
```

### Production Image

Build the production image:

```bash
docker build --no-cache --tag cff-chart-prototype .
```

Run the production container:

```bash
docker run -p 3000:3000 cff-chart-prototype
```

### Docker Compose

To set up a local environment with the necessary services:

```bash
docker compose up --build -d
```

## Dependabot

To enable Dependabot for automatic dependency updates, rename the example configuration file:

```bash
mv .github/example.dependabot.yml .github/dependabot.yml
```

## SonarCloud

For code quality and security analysis, configure SonarCloud by setting up the `sonar-project.properties` file as per the instructions provided.

## License

This project is licensed under the Open Government Licence v3.0. See the [LICENSE](LICENSE) file for more details.
