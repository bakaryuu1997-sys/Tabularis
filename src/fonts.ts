/**
 * Bundled UI and editor fonts with full Vietnamese (and Latin) coverage, so text
 * never falls back to a CJK system font that lacks letters such as ấ, ế, ố.
 *
 * Imported from JavaScript rather than with `@import` in index.css: Tailwind
 * inlines CSS imports without rebasing their relative `url()`s, so the WOFF2
 * files were never emitted into the build. Vite handles these imports itself.
 */
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
