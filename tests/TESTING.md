# TESTING.md

Hear me out.

This is a somewhat duplicative approach, but it scales well so please try to keep it intact as you make changes.

## The idea

This is the event sequence.

1. We run `npm run test`, which calls `playwright test`
2. Playwright finds the `test-foo-bar.test.ts` files and runs them
3. The test files import a special `test` function that will fail the test on client errors.
4. The test file calls `page.goto` which renders the corresponding `test-foo-bar.html` files.
5. The HTML file's only job is calling the corresponding `test-foo-bar.ts` file.
6. The code in `test-foo-bar.ts` runs and imports a client-side `test` utility and `chai` for `expect`
7. Any failed `expect` calls will fail the test.
8. GPU compute tests need to call `gpuCompute.compute();` at the end to run the logic

And ALL of this is because:

I found it difficult to call the functions-under-test in the `.test.ts` file.
