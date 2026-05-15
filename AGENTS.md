<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


## How to Contribute

-   **Add changes in [Changelog](CHANGELOG.md)**
-   **Test your changes** to ensure they work as expected, use `npm test`

## Code Style

-   Follow the existing code style and structure.
-   Use comments to explain complex logic.

## Emoji in `[brackets]`


-   `[🧠]` Marks a place where there is something to decide and think about.
-   `@@@` Marks a place where text / documentation / ... must be written.


## Dictionary

-   @@@

## Common rules

-   Always analyze the context and requirements before generating any code.
-   Write clear, maintainable, and well-documented code.
-   Write JSDoc comments for all entities - functions, classes, types, top-level constants, etc.
-   You (the AI coding agent) are running inside a Node process, so do not kill all Node processes such as `taskkill /F /IM node.exe`. If you need to stop something you spawned, kill only that specific process, for example by PID or by port.

## Additional context

-   Attached images (if any) are relative to the root of the project.


<!--

### Database migrations for Agents server _(as additional context)_

-   Migrations are located in `apps/agents-server/src/database/migrations`
-   Be aware that table names in migrations have prefix `prefix_` _(look at existing migrations for reference)_
-   Migrations should be backwards compatible:
    -   Meaning that earlier versions of the server should be able to run with the database after migration without any issues.
    -   This is important because we want to have the same database for production and preview environments.
    -   This database will be migrated to the latest version of the preview environment, but the production environment should be able to run with it without any issues.
    -   The only thing that can happen is that older versions of the server will not be able to use new features.
    -   Adding new columns, tables, etc. is fine, but do not remove or rename existing ones, and do not change the meaning of existing columns or tables.
    -   When in doubt, prefer to add new things instead of changing existing ones.

-->


## Coding rules

-   Keep in mind the DRY _(don't repeat yourself)_ principle.
-   Keep in mind the SOLID principles.
-   Do a proper analysis of the current functionality before you start implementing.
-   Keep small responsibilities of functions and classes, avoid creating big functions or classes that do many things.
-   When throwing errors, throw [branded errors](src/errors) and use `spaceTrim` utility to write clear and well-formatted multiline detailed error messages.
    -   Format errors as markdown, for example `variables` should be in backticks and important notes can be in bold.
-   Constants should always be `UPPER_SNAKE_CASE`.
-   Boolean variables should always be prefixed with `is`, for example `isUserChatJobLeaseExpired` or `IS_DEBUG_MODE`.
-   Do not use abbreviations, for example use `isExpired` instead of `isExp`, `translateMessage` instead of `t`, etc.
    -   It is fine to use well-known abbreviations, for example `id`, `url`, `html`, etc.
-   When writing multiline strings, use `spaceTrim` utility.
-   Do only the change described in the prompt. Do not add any additional features or make any additional changes that are not described there.
    -   If you find some critical issue that is not described in the prompt, report it to `./AGENT_REPORT.md` in the root of the project.

