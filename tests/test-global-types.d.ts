export { };

declare global {
    // NOTE: All additions to the global object must be optional
    interface Window {
        addWater?: typeof import('./test-water-sources-system').addWater;
        clearWater?: typeof import('./test-water-sources-system').clearWater;
    }
}         