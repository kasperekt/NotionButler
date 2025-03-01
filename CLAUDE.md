# NotionButler Project Guidelines

## Build & Deploy Commands
- Build all (shared lib + functions): `npm run build`
- Build shared library only: `cd shared && npm run build` 
- Build all functions: `npm run build-functions`
- Build single function: `cd functions/<FunctionName> && npm run build`
- Deploy function: `./scripts/build-and-deploy.zsh <FunctionName>`

## Testing
- Run all tests: `npm test`
- Test shared library only: `cd shared && npm test`
- Test all functions: `npm run test-functions`
- Test single function: `cd functions/<FunctionName> && npm test`

## Code Style
- **Naming**: camelCase for variables/functions, PascalCase for interfaces/types
- **Imports**: External dependencies first, then internal modules
- **Types**: Always define explicit return types, especially for async functions
- **Error Handling**: Use try/catch blocks with specific error messages and proper logging

## Project Structure
- Shared utilities in `/shared/` directory
- Each AWS Lambda function in `/functions/<FunctionName>/`
- Main code in `src/index.ts`, compiled output in `dist/`
- Configuration via AWS SSM Parameter Store with path pattern `/NotionButler/...`

## TypeScript Settings
- ES2022 target with CommonJS modules
- Strict type checking enabled
- Function-specific configs extend `tsconfig.base.json`

## Notion API Pattern
- Import shared utilities from `notion-butler-shared` package
- Use `getNotionClient()` factory to obtain authenticated client
- Retrieve database IDs via `getDatabaseId(paramName)` using SSM parameters
- Get JSON configuration via `getConfig<T>(configPath)` 
- Handle API responses with proper status codes and consistent JSON structure