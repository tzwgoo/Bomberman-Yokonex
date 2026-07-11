import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "com.yokonex.bomberman",
    appName: "Bomberman",
    webDir: "dist",
    server: {
        cleartext: true,
    },
};

export default config;
