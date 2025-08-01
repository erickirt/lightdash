<summary>
Auto-generated API routes and OpenAPI documentation produced by TSOA from TypeScript controllers. Contains Express route definitions and Swagger JSON specification for the entire Lightdash REST API.
</summary>

<howToUse>
This folder contains auto-generated files that should never be manually edited. The files are regenerated using the `pnpm generate-api` command when controller definitions change.

```bash
# Regenerate API files after controller changes
pnpm generate-api

# The generated files are automatically imported by the Express app
import { RegisterRoutes } from './generated/routes';
```

The generated routes are registered in the main Express application and provide type-safe API endpoints based on TSOA decorators in controller files.
</howToUse>

<codeExample>

```typescript
// Example: How generated routes are used in Express app
import { RegisterRoutes } from './generated/routes';
import express from 'express';

const app = express();

// Generated routes are registered automatically
RegisterRoutes(app);

// The routes.ts file contains mappings like:
app.get(
    '/api/v1/projects/:projectUuid/charts',
    ...middlewares,
    SavedChartController.getCharts,
);
```

</codeExample>

<importantToKnow>
- **NEVER manually edit files in this folder** - they are completely auto-generated
- Files are regenerated by running `pnpm generate-api` when controller changes are made
- The routes.ts file contains Express route definitions for all API endpoints
- The swagger.json file provides OpenAPI 3.0 specification for API documentation
- Route generation is based on TSOA decorators (@Route, @Get, @Post, etc.) in controller files
- Type safety is maintained through the generation process from TypeScript definitions
- Changes to API structure require regeneration to update these files
- The generated routes include proper middleware chains and parameter validation
- Swagger documentation is automatically kept in sync with controller definitions
</importantToKnow>

<links>
@/packages/backend/src/controllers/ - Source controller files that generate these routes
@/packages/backend/package.json - Contains generate-api script definition
@/packages/backend/tsoa.json - TSOA configuration for route generation
</links>
