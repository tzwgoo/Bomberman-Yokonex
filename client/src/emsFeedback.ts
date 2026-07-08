export type EmsFeedbackEventType = "bomb_placed" | "bomb_exploded" | "death" | "round_win" | "round_lose" | "power_up";

export type EmsFeedbackAction = "fixed" | "waveform";

export type EmsFeedbackStep = {
    durationMs: number;
    channelA: number;
    channelB: number;
    channelAMode: number;
    channelBMode: number;
};

export type EmsFeedbackRule = {
    eventType: EmsFeedbackEventType;
    enabled: boolean;
    action: EmsFeedbackAction;
    channelA: number;
    channelB: number;
    durationMs: number;
    steps: EmsFeedbackStep[];
};

export type EmsFeedbackConfig = {
    enabled: boolean;
    maxStrength: number;
    rules: EmsFeedbackRule[];
};

const EMS_SERVICE_UUID = "0000ff30-0000-1000-8000-00805f9b34fb";
const EMS_WRITE_CHAR_UUID = "0000ff31-0000-1000-8000-00805f9b34fb";
const EMS_NOTIFY_CHAR_UUID = "0000ff32-0000-1000-8000-00805f9b34fb";
const CONFIG_KEY = "bomberman:ems-feedback-config";
const DEFAULT_MAX_STRENGTH = 180;

export const EMS_FEEDBACK_EVENT_LABELS: Record<EmsFeedbackEventType, string> = {
    bomb_placed: "放炸弹",
    bomb_exploded: "爆炸",
    death: "死亡",
    round_win: "胜利",
    round_lose: "失败",
    power_up: "捡道具",
};

const DEFAULT_RULES: EmsFeedbackRule[] = [
    createDefaultRule("bomb_placed", 28, 28, 160),
    createDefaultRule("bomb_exploded", 58, 58, 220),
    createDefaultRule("death", 80, 80, 320),
    createDefaultRule("round_win", 42, 18, 260),
    createDefaultRule("round_lose", 18, 42, 260),
    createDefaultRule("power_up", 24, 44, 180),
];

type ConnectedEmsDevice = {
    name: string;
    protocol: "ems_v1" | "ems_v2";
    characteristic: any;
    notifyCharacteristic?: any;
    batteryTimer?: number;
};

class EmsFeedbackController {
    config: EmsFeedbackConfig = loadEmsFeedbackConfig();
    device?: ConnectedEmsDevice;
    batteryLevel = -1;
    status = "未连接";
    onBatteryChange?: (batteryLevel: number) => void;
    private playQueue: Promise<void> = Promise.resolve();

    isSupported() {
        return Boolean((navigator as any).bluetooth);
    }

    async connect() {
        if (!this.isSupported()) {
            throw new Error("当前浏览器不支持 Web Bluetooth，请使用 Chrome 或 Edge");
        }

        const bluetooth = (navigator as any).bluetooth;
        const device = await bluetooth.requestDevice({
            filters: [
                { services: [EMS_SERVICE_UUID] },
                { namePrefix: "YYC-DJ" },
            ],
            optionalServices: [EMS_SERVICE_UUID],
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(EMS_SERVICE_UUID);
        const characteristic = await service.getCharacteristic(EMS_WRITE_CHAR_UUID);
        const notifyCharacteristic = await this.resolveNotifyCharacteristic(service);
        const name = String(device.name || "EMS设备");
        this.device = {
            name,
            protocol: name.toUpperCase().startsWith("YYC-DJ-V2") ? "ems_v2" : "ems_v1",
            characteristic,
            notifyCharacteristic,
        };
        this.status = `已连接 ${name}`;
        await this.startBatteryTelemetry();
        device.addEventListener?.("gattserverdisconnected", () => {
            this.clearBatteryTimer();
            this.device = undefined;
            this.updateBatteryLevel(-1);
            this.status = "已断开";
        });
    }

    saveConfig(config: EmsFeedbackConfig) {
        this.config = normalizeConfig(config);
        window.localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
    }

    trigger(eventType: EmsFeedbackEventType) {
        if (!this.config.enabled || !this.device) {
            return;
        }

        const rule = this.config.rules.find((item) => item.eventType === eventType);
        if (!rule?.enabled) {
            return;
        }

        this.playQueue = this.playQueue
            .catch(() => undefined)
            .then(() => this.playRule(rule))
            .catch((error) => {
                this.status = error instanceof Error ? error.message : "EMS触发失败";
            });
    }

    async test(rule: EmsFeedbackRule) {
        if (!this.device) {
            await this.connect();
        }
        await this.playRule(normalizeRule(rule));
    }

    private async playRule(rule: EmsFeedbackRule) {
        const device = this.device;
        if (!device) {
            return;
        }

        const steps = rule.action === "waveform" && rule.steps.length
            ? rule.steps
            : [createStep(rule.durationMs, rule.channelA, rule.channelB)];
        const cappedSteps = steps.map((step) => capStepStrength(step, this.config.maxStrength));

        // EMS 接入方式参考 Bililive-YOKONEX：每段写入固定强度包，等待分段时长，结束后写入停止包。
        for (const step of cappedSteps) {
            await writePacket(device.characteristic, createPacket(step, device.protocol));
            await sleep(Math.max(1, step.durationMs));
        }
        await writePacket(device.characteristic, createStopPacket(device.protocol));
    }

    private async resolveNotifyCharacteristic(service: any) {
        try {
            return await service.getCharacteristic(EMS_NOTIFY_CHAR_UUID);
        } catch {
            return undefined;
        }
    }

    private async startBatteryTelemetry() {
        const device = this.device;
        if (!device) {
            return;
        }

        if (device.notifyCharacteristic) {
            device.notifyCharacteristic.addEventListener("characteristicvaluechanged", (event: Event) => {
                const value = (event.target as any)?.value;
                const batteryLevel = parseBatteryLevel(value);
                if (batteryLevel !== null) {
                    this.updateBatteryLevel(batteryLevel);
                }
            });
            await device.notifyCharacteristic.startNotifications();
        }

        await this.queryBatteryLevel();
        // EMS 电量变化慢，这里定时查询即可让房间内玩家持续看到最新状态。
        device.batteryTimer = window.setInterval(() => void this.queryBatteryLevel(), 15000);
    }

    private async queryBatteryLevel() {
        const device = this.device;
        if (!device) {
            return;
        }

        await writePacket(device.characteristic, createBatteryQueryPacket());
    }

    private clearBatteryTimer() {
        if (this.device?.batteryTimer) {
            window.clearInterval(this.device.batteryTimer);
            this.device.batteryTimer = undefined;
        }
    }

    private updateBatteryLevel(batteryLevel: number) {
        const nextLevel = clampInt(batteryLevel, -1, 100, -1);
        if (nextLevel === this.batteryLevel) {
            return;
        }

        this.batteryLevel = nextLevel;
        this.onBatteryChange?.(nextLevel);
    }
}

export const emsFeedbackController = new EmsFeedbackController();

export function loadEmsFeedbackConfig(): EmsFeedbackConfig {
    try {
        const raw = window.localStorage.getItem(CONFIG_KEY);
        if (!raw) {
            return normalizeConfig({ enabled: false, maxStrength: DEFAULT_MAX_STRENGTH, rules: DEFAULT_RULES });
        }
        return normalizeConfig(JSON.parse(raw));
    } catch {
        return normalizeConfig({ enabled: false, maxStrength: DEFAULT_MAX_STRENGTH, rules: DEFAULT_RULES });
    }
}

function normalizeConfig(value: Partial<EmsFeedbackConfig>): EmsFeedbackConfig {
    const incomingRules = Array.isArray(value.rules) ? value.rules : [];
    return {
        enabled: Boolean(value.enabled),
        maxStrength: normalizeStrength(value.maxStrength ?? DEFAULT_MAX_STRENGTH),
        rules: DEFAULT_RULES.map((defaultRule) => {
            const incoming = incomingRules.find((item) => item.eventType === defaultRule.eventType);
            return normalizeRule({ ...defaultRule, ...incoming });
        }),
    };
}

function normalizeRule(value: Partial<EmsFeedbackRule> & { eventType: EmsFeedbackEventType }): EmsFeedbackRule {
    return {
        eventType: value.eventType,
        enabled: Boolean(value.enabled),
        action: value.action === "waveform" ? "waveform" : "fixed",
        channelA: normalizeStrength(value.channelA),
        channelB: normalizeStrength(value.channelB),
        durationMs: normalizeDuration(value.durationMs),
        steps: Array.isArray(value.steps)
            ? value.steps.map((step) => normalizeStep(step)).filter((step) => step.durationMs > 0)
            : [],
    };
}

function normalizeStep(value: Partial<EmsFeedbackStep>): EmsFeedbackStep {
    return createStep(
        normalizeDuration(value.durationMs),
        normalizeStrength(value.channelA),
        normalizeStrength(value.channelB),
        normalizeMode(value.channelAMode),
        normalizeMode(value.channelBMode),
    );
}

function createDefaultRule(eventType: EmsFeedbackEventType, channelA: number, channelB: number, durationMs: number): EmsFeedbackRule {
    return {
        eventType,
        enabled: false,
        action: "fixed",
        channelA,
        channelB,
        durationMs,
        steps: [createStep(durationMs, channelA, channelB)],
    };
}

function createStep(durationMs: number, channelA: number, channelB: number, channelAMode = 1, channelBMode = 1): EmsFeedbackStep {
    return {
        durationMs,
        channelA,
        channelB,
        channelAMode,
        channelBMode,
    };
}

function capStepStrength(step: EmsFeedbackStep, maxStrength: number): EmsFeedbackStep {
    const cap = normalizeStrength(maxStrength);
    // 设备上限只限制真实输出，不改用户保存的事件配置。
    return {
        ...step,
        channelA: Math.min(step.channelA, cap),
        channelB: Math.min(step.channelB, cap),
    };
}

function createPacket(step: EmsFeedbackStep, protocol: "ems_v1" | "ems_v2") {
    if (protocol === "ems_v1") {
        return createV1Packet(step);
    }
    return createV2FixedPacket(step);
}

function createV1Packet(step: EmsFeedbackStep) {
    const channel = resolveV1Channel(step);
    const useChannelB = channel === 0x02 || step.channelB > step.channelA;
    const strength = useChannelB ? step.channelB : step.channelA;
    const mode = useChannelB ? step.channelBMode : step.channelAMode;
    const bytes = [
        0x35,
        0x11,
        channel,
        channel === 0x00 ? 0x00 : 0x01,
        high(strength),
        low(strength),
        mode,
        0x00,
        0x00,
    ];
    bytes.push(checksum(bytes));
    return new Uint8Array(bytes);
}

function createV2FixedPacket(step: EmsFeedbackStep) {
    const bytes = [
        0x35,
        0x11,
        0x01,
        high(step.channelA),
        low(step.channelA),
        step.channelAMode,
        high(step.channelB),
        low(step.channelB),
        step.channelBMode,
    ];
    bytes.push(checksum(bytes));
    return new Uint8Array(bytes);
}

function createStopPacket(protocol: "ems_v1" | "ems_v2") {
    if (protocol === "ems_v1") {
        const bytes = [0x35, 0x11, 0x03, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00];
        bytes.push(checksum(bytes));
        return new Uint8Array(bytes);
    }
    return createV2FixedPacket(createStep(0, 0, 0));
}

function createBatteryQueryPacket() {
    const bytes = [0x35, 0x71, 0x04];
    bytes.push(checksum(bytes));
    return new Uint8Array(bytes);
}

function parseBatteryLevel(value: DataView | undefined) {
    if (!value || value.byteLength < 4) {
        return null;
    }

    if (value.getUint8(0) !== 0x35 || value.getUint8(1) !== 0x71 || value.getUint8(2) !== 0x04) {
        return null;
    }

    return clampInt(value.getUint8(3), 0, 100, 0);
}

function resolveV1Channel(step: EmsFeedbackStep) {
    if (step.channelA > 0 && step.channelB > 0) {
        return 0x03;
    }
    if (step.channelA > 0) {
        return 0x01;
    }
    if (step.channelB > 0) {
        return 0x02;
    }
    return 0x00;
}

async function writePacket(characteristic: any, packet: Uint8Array) {
    if (typeof characteristic.writeValueWithoutResponse === "function") {
        await characteristic.writeValueWithoutResponse(packet);
        return;
    }
    await characteristic.writeValue(packet);
}

function normalizeStrength(value: unknown) {
    return clampInt(value, 0, 180, 0);
}

function normalizeDuration(value: unknown) {
    return clampInt(value, 1, 5000, 200);
}

function normalizeMode(value: unknown) {
    return clampInt(value, 1, 17, 1);
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function high(value: number) {
    return (value >> 8) & 0xff;
}

function low(value: number) {
    return value & 0xff;
}

function checksum(bytes: number[]) {
    return bytes.reduce((sum, value) => (sum + value) & 0xff, 0);
}

function sleep(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}
