# Companion 🤝

A web extension to keep you company.

## About the Code

UI stack:

-   [Lit](https://lit.dev/) for view layer abstraction
-   [Typescript](https://www.typescriptlang.org/) for type checking
-   [Vite](https://vitejs.dev/) for bundling

This extension's `manifest.json` references build artifacts located in `dist/`. For now you will need to run the following to build these artifacts before you can use the extension:

`yarn && yarn build`

## Developing

Running `yarn dev` will rebuild source files on change, and launch an instance of Firefox with the extension loaded (via [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)). You should create a new Firefox profile specifically for testing and then set the environment variable [WEB_EXT_FIREFOX_PROFILE](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#firefox-profile) to the name of that profile. The profile cannot contain any spaces.

If the companion sidebar doesn't open automatically, it can be opened via the file menu by going to `View > Sidebar`.

## Secrets

In order to fully debug the companion, you need the Google Client ID and Google Client Secret. You can reach out to me (@mkaply) to obtain those if you are a Mozilla employee. For other folks, you can create an Desktop application in [Google Cloud](https://console.cloud.google.com/apis/dashboard). You'll need to allow the scopes userinfo.email, calendar.calendarlist.readonly, calendar.events.readonly, drive.metadata.readonly and enable the APIs for those services.
