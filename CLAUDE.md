# NotionButler Project Guidelines

## Build & Deploy Commands
- Build all functions: `npm run build`
- Build single function: `cd functions/<FunctionName> && npm run build`
- Deploy function: `./scripts/build-and-deploy.zsh <FunctionName>`

## Code Style
- **Naming**: camelCase for variables/functions, PascalCase for interfaces/types
- **Imports**: External dependencies first, then internal modules
- **Types**: Always define explicit return types, especially for async functions
- **Error Handling**: Use try/catch blocks with specific error messages and proper logging

## Project Structure
- Each AWS Lambda function in `/functions/<FunctionName>/`
- Main code in `src/index.ts`, compiled output in `dist/`
- Configuration via AWS SSM Parameter Store with path pattern `/NotionButler/...`

## TypeScript Settings
- ES2022 target with CommonJS modules
- Strict type checking enabled
- Function-specific configs extend `tsconfig.base.json`

## Notion API Pattern
- Use `getNotionClient()` factory to obtain authenticated client
- Retrieve database IDs via `getDatabaseId()` using SSM parameters
- Handle API responses with proper status codes and consistent JSON structure