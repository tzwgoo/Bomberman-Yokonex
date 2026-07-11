export type EmsFeedbackEventType = "bomb_placed" | "bomb_exploded" | "death" | "round_win" | "round_lose" | "power_up";

export type EmsFeedbackAction = "fixed" | "waveform";
export type EmsTransport = "ble" | "websocket" | "command_websocket";

export type EmsFeedbackStep = {
    durationMs: number;
    channelA: number;
    channelB: number;
    channelAMode: number;
    channelBMode: number;
};

export type EmsFeedbackRule = {
    eventType: EmsFeedbackEventType;
    commandId: string;
    enabled: boolean;
    action: EmsFeedbackAction;
    channelA: number;
    channelB: number;
    durationMs: number;
    steps: EmsFeedbackStep[];
};

export type EmsConnectionConfig = {
    transport: EmsTransport;
    websocketUrl: string;
    commandWebsocketUrl: string;
    commandUid: string;
    commandToken: string;
};

export type EmsFeedbackConfig = {
    enabled: boolean;
    maxStrength: number;
    connection: EmsConnectionConfig;
    rules: EmsFeedbackRule[];
};

const DGLAB_V3_SERVICE_UUID = "0000180c-0000-1000-8000-00805f9b34fb";
const DGLAB_V3_WRITE_UUID = "0000150a-0000-1000-8000-00805f9b34fb";
const DGLAB_V2_SERVICE_UUID = "955a180b-0fe2-f5aa-a094-84b8d4f3e8ad";
const DGLAB_V2_STRENGTH_UUID = "955a1504-0fe2-f5aa-a094-84b8d4f3e8ad";
const DGLAB_V2_WAVE_B_UUID = "955a1505-0fe2-f5aa-a094-84b8d4f3e8ad";
const DGLAB_V2_WAVE_A_UUID = "955a1506-0fe2-f5aa-a094-84b8d4f3e8ad";
const LEGACY_EMS_SERVICE_UUID = "0000ff30-0000-1000-8000-00805f9b34fb";
const LEGACY_EMS_WRITE_UUID = "0000ff31-0000-1000-8000-00805f9b34fb";
const LEGACY_EMS_NOTIFY_UUID = "0000ff32-0000-1000-8000-00805f9b34fb";
const BATTERY_SERVICE_UUID = "0000180a-0000-1000-8000-00805f9b34fb";
const BATTERY_CHARACTERISTIC_UUID = "00001500-0000-1000-8000-00805f9b34fb";
const CONFIG_KEY = "bomberman:ems-feedback-config";
const DEFAULT_MAX_STRENGTH = 180;
const DEFAULT_WEBSOCKET_URL = String(import.meta.env.VITE_DGLAB_WS_URL || "ws://127.0.0.1:9999");
const DEFAULT_COMMAND_WEBSOCKET_URL = String(import.meta.env.VITE_EMS_COMMAND_WS_URL || "ws://103.236.55.92:43001");
const DGLAB_PAIRING_PREFIX = "https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#";
const DGLAB_WAVE_HEX = "0A0A0A0A64646464";

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

type DglabV2Device = {
    kind: "ble";
    name: string;
    protocol: "dglab_v2";
    bluetoothDevice: any;
    strengthCharacteristic: any;
    waveACharacteristic: any;
    waveBCharacteristic: any;
};

type DglabV3Device = {
    kind: "ble";
    name: string;
    protocol: "dglab_v3";
    bluetoothDevice: any;
    writeCharacteristic: any;
};

type DglabWebSocketDevice = {
    kind: "websocket";
    socket: WebSocket;
    clientId: string;
    targetId?: string;
};

type CommandWebSocketDevice = {
    kind: "command_websocket";
    socket: WebSocket;
    userId: string;
    heartbeatTimer: number;
};

type LegacyEmsDevice = {
    kind: "ble";
    name: string;
    protocol: "ems_v1" | "ems_v2";
    bluetoothDevice: any;
    characteristic: any;
    notifyCharacteristic?: any;
    batteryTimer?: number;
};

type ConnectedEmsDevice = DglabV2Device | DglabV3Device | DglabWebSocketDevice | CommandWebSocketDevice | LegacyEmsDevice;

class EmsFeedbackController {
    config: EmsFeedbackConfig = loadEmsFeedbackConfig();
    device?: ConnectedEmsDevice;
    batteryLevel = -1;
    status = "未连接";
    pairingUrl = "";
    onBatteryChange?: (batteryLevel: number) => void;
    onStatusChange?: (status: string) => void;
    private playQueue: Promise<void> = Promise.resolve();

    isSupported(transport: EmsTransport = this.config.connection.transport) {
        return transport !== "ble" || Boolean((navigator as any).bluetooth);
    }

    saveConnection(connection: EmsConnectionConfig) {
        this.saveConfig({ ...this.config, connection });
    }

    async connect(connection: EmsConnectionConfig = this.config.connection) {
        this.saveConnection(connection);
        await this.disconnect();
        if (connection.transport === "websocket") {
            await this.connectWebSocket(connection.websocketUrl);
            return;
        }
        if (connection.transport === "command_websocket") {
            await this.connectCommandWebSocket(connection.commandWebsocketUrl, connection.commandUid, connection.commandToken);
            return;
        }
        await this.connectBluetooth();
    }

    async disconnect() {
        await this.playQueue.catch(() => undefined);
        const device = this.device;
        if (device) {
            try {
                // 主动切换连接时先清队列并归零，避免旧设备保留上一次事件的输出。
                if (device.kind === "websocket" && device.targetId) {
                    this.sendWebSocketCommand(device, "clear-1");
                    this.sendWebSocketCommand(device, "clear-2");
                    this.sendWebSocketStrength(device, "A", 0);
                    this.sendWebSocketStrength(device, "B", 0);
                } else if (device.kind === "command_websocket" && device.socket.readyState === WebSocket.OPEN) {
                    device.socket.send(JSON.stringify({ type: "logout", userId: device.userId }));
                } else if (device.kind === "ble" && device.protocol === "dglab_v3") {
                    await writePacket(device.writeCharacteristic, createV3StopPacket());
                } else if (device.kind === "ble" && device.protocol === "dglab_v2") {
                    await writePacket(device.strengthCharacteristic, createV2StrengthPacket(0, 0));
                } else if (device.kind === "ble") {
                    await writePacket(device.characteristic, createLegacyStopPacket(device.protocol));
                }
            } catch {
                // 设备可能已经物理断开，后续仍需完成本地清理。
            }
        }
        this.device = undefined;
        this.pairingUrl = "";
        this.updateBatteryLevel(-1);

        if (device?.kind === "websocket") {
            device.socket.close();
        } else if (device?.kind === "command_websocket") {
            window.clearInterval(device.heartbeatTimer);
            device.socket.close();
        } else if (device?.kind === "ble") {
            if (device.protocol === "ems_v1" || device.protocol === "ems_v2") {
                this.clearLegacyBatteryTimer(device);
            }
            device.bluetoothDevice.gatt?.disconnect();
        }
    }

    saveConfig(config: EmsFeedbackConfig) {
        this.config = normalizeConfig(config);
        window.localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
    }

    trigger(eventType: EmsFeedbackEventType) {
        if (!this.config.enabled || !this.isReady()) {
            return;
        }

        const rule = this.config.rules.find((item) => item.eventType === eventType);
        if (!rule?.enabled) {
            return;
        }

        this.playQueue = this.playQueue
            .catch(() => undefined)
            .then(() => this.playRule(rule))
            .catch((error) => this.setStatus(error instanceof Error ? error.message : "设备触发失败"));
    }

    async test(rule: EmsFeedbackRule) {
        if (!this.isReady()) {
            await this.connect();
        }
        if (!this.isReady()) {
            throw new Error("请先完成设备连接");
        }
        await this.playRule(normalizeRule(rule));
    }

    private isReady() {
        if (!this.device) {
            return false;
        }
        if (this.device.kind === "ble") {
            return true;
        }
        if (this.device.kind === "command_websocket") {
            return this.device.socket.readyState === WebSocket.OPEN;
        }
        return Boolean(this.device.targetId);
    }

    private async connectBluetooth() {
        if (!this.isSupported("ble")) {
            throw new Error("当前浏览器不支持 Web Bluetooth，请使用 Chrome 或 Edge");
        }

        const bluetooth = (navigator as any).bluetooth;
        const bluetoothDevice = await bluetooth.requestDevice({
            filters: [
                { namePrefix: "47L121000" },
                { namePrefix: "D-LAB ESTIM01" },
                { services: [LEGACY_EMS_SERVICE_UUID] },
                { namePrefix: "YYC-DJ" },
            ],
            optionalServices: [DGLAB_V3_SERVICE_UUID, DGLAB_V2_SERVICE_UUID, BATTERY_SERVICE_UUID, LEGACY_EMS_SERVICE_UUID],
        });
        const server = await bluetoothDevice.gatt.connect();
        const name = String(bluetoothDevice.name || "DG-LAB 脉冲主机");

        if (name.toUpperCase().startsWith("YYC-DJ")) {
            const service = await server.getPrimaryService(LEGACY_EMS_SERVICE_UUID);
            let notifyCharacteristic: any;
            try {
                notifyCharacteristic = await service.getCharacteristic(LEGACY_EMS_NOTIFY_UUID);
            } catch {
                notifyCharacteristic = undefined;
            }
            const legacyDevice: LegacyEmsDevice = {
                kind: "ble",
                name,
                protocol: name.toUpperCase().startsWith("YYC-DJ-V2") ? "ems_v2" : "ems_v1",
                bluetoothDevice,
                characteristic: await service.getCharacteristic(LEGACY_EMS_WRITE_UUID),
                notifyCharacteristic,
            };
            this.device = legacyDevice;
            await this.startLegacyBatteryTelemetry(legacyDevice);
        } else if (name.toUpperCase().startsWith("D-LAB ESTIM01")) {
            const service = await server.getPrimaryService(DGLAB_V2_SERVICE_UUID);
            this.device = {
                kind: "ble",
                name,
                protocol: "dglab_v2",
                bluetoothDevice,
                strengthCharacteristic: await service.getCharacteristic(DGLAB_V2_STRENGTH_UUID),
                waveACharacteristic: await service.getCharacteristic(DGLAB_V2_WAVE_A_UUID),
                waveBCharacteristic: await service.getCharacteristic(DGLAB_V2_WAVE_B_UUID),
            };
        } else {
            const service = await server.getPrimaryService(DGLAB_V3_SERVICE_UUID);
            this.device = {
                kind: "ble",
                name,
                protocol: "dglab_v3",
                bluetoothDevice,
                writeCharacteristic: await service.getCharacteristic(DGLAB_V3_WRITE_UUID),
            };
        }

        bluetoothDevice.addEventListener?.("gattserverdisconnected", () => {
            if (this.device?.kind === "ble" && this.device.bluetoothDevice === bluetoothDevice) {
                if (this.device.protocol === "ems_v1" || this.device.protocol === "ems_v2") {
                    this.clearLegacyBatteryTimer(this.device);
                }
                this.device = undefined;
                this.updateBatteryLevel(-1);
                this.setStatus("DG-LAB BLE 已断开");
            }
        });
        if (this.device?.kind === "ble" && (this.device.protocol === "dglab_v2" || this.device.protocol === "dglab_v3")) {
            await this.startBatteryTelemetry(server);
        }
        this.setStatus(`已连接 ${name}`);
    }

    private async connectWebSocket(rawUrl: string) {
        const websocketUrl = normalizeWebSocketUrl(rawUrl);
        const socket = new WebSocket(websocketUrl);
        this.setStatus("正在连接 DG-LAB WebSocket...");

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const timeout = window.setTimeout(() => finish(new Error("WebSocket 连接超时")), 8000);
            const finish = (error?: Error) => {
                if (settled) {
                    return;
                }
                settled = true;
                window.clearTimeout(timeout);
                error ? reject(error) : resolve();
            };

            socket.addEventListener("error", () => finish(new Error("DG-LAB WebSocket 连接失败")), { once: true });
            socket.addEventListener("close", () => {
                if (this.device?.kind === "websocket" && this.device.socket === socket) {
                    this.device = undefined;
                    this.pairingUrl = "";
                    this.setStatus("DG-LAB WebSocket 已断开");
                }
                finish(new Error("DG-LAB WebSocket 已断开"));
            });
            socket.addEventListener("message", (event) => {
                const message = parseWebSocketMessage(event.data);
                if (!message) {
                    return;
                }

                if (message.type === "bind" && message.message === "targetId") {
                    const clientId = String(message.clientId || "");
                    if (!clientId) {
                        finish(new Error("WebSocket 服务未返回终端 ID"));
                        return;
                    }
                    this.device = { kind: "websocket", socket, clientId };
                    this.pairingUrl = `${DGLAB_PAIRING_PREFIX}${websocketUrl}/${clientId}`;
                    this.setStatus("等待 DG-LAB APP 扫码绑定");
                    finish();
                    return;
                }

                const current = this.device;
                if (current?.kind !== "websocket" || current.socket !== socket) {
                    return;
                }
                if (message.type === "bind" && message.message === "200") {
                    current.targetId = String(message.targetId || "");
                    this.setStatus(current.targetId ? "已连接 DG-LAB APP" : "绑定失败：缺少 APP 终端 ID");
                } else if (message.type === "break") {
                    current.targetId = undefined;
                    this.setStatus("DG-LAB APP 已断开");
                } else if (message.type === "error") {
                    this.setStatus(`DG-LAB WebSocket 错误：${message.message}`);
                }
            });
        });
    }

    private async connectCommandWebSocket(rawUrl: string, uid: string, token: string) {
        const websocketUrl = normalizeCommandWebSocketUrl(rawUrl);
        const normalizedUid = uid.trim();
        const normalizedToken = token.trim();
        if (!normalizedUid || !normalizedToken) {
            throw new Error("指令 WebSocket 需要填写 UID 和 Token");
        }

        const socket = new WebSocket(websocketUrl);
        this.setStatus("正在登录指令 WebSocket...");

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const timeout = window.setTimeout(() => finish(new Error("指令 WebSocket 登录超时")), 10000);
            const finish = (error?: Error) => {
                if (settled) {
                    return;
                }
                settled = true;
                window.clearTimeout(timeout);
                if (error) {
                    socket.close();
                    reject(error);
                } else {
                    resolve();
                }
            };

            socket.addEventListener("open", () => {
                socket.send(JSON.stringify({ type: "login", uid: normalizedUid, token: normalizedToken }));
            }, { once: true });
            socket.addEventListener("error", () => finish(new Error("指令 WebSocket 连接失败")), { once: true });
            socket.addEventListener("close", () => {
                const current = this.device;
                if (current?.kind === "command_websocket" && current.socket === socket) {
                    window.clearInterval(current.heartbeatTimer);
                    this.device = undefined;
                    this.setStatus("指令 WebSocket 已断开");
                }
                finish(new Error("指令 WebSocket 已断开"));
            });
            socket.addEventListener("message", (event) => {
                const message = parseWebSocketMessage(event.data);
                if (!message) {
                    return;
                }

                if (message.type === "loginResult") {
                    if (!message.success) {
                        finish(new Error(String(message.message || "指令 WebSocket 登录失败")));
                        return;
                    }
                    const userId = String(message.data?.userId || "").replace(/^game_/, "");
                    if (!userId) {
                        finish(new Error("登录响应缺少 userId"));
                        return;
                    }
                    const commandDevice: CommandWebSocketDevice = {
                        kind: "command_websocket",
                        socket,
                        userId,
                        heartbeatTimer: 0,
                    };
                    commandDevice.heartbeatTimer = window.setInterval(() => {
                        if (socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({ type: "ping" }));
                        }
                    }, 30000);
                    this.device = commandDevice;
                    this.setStatus(`已连接指令 WebSocket · 用户 ${userId}`);
                    finish();
                    return;
                }

                const current = this.device;
                if (current?.kind !== "command_websocket" || current.socket !== socket) {
                    return;
                }
                if (message.type === "commandResult") {
                    this.setStatus(message.success ? "指令发送成功" : String(message.message || "指令发送失败"));
                } else if (message.type === "error") {
                    this.setStatus(String(message.message || "指令 WebSocket 错误"));
                } else if (message.type === "status" && message.userId === current.userId && message.data?.isReady === false) {
                    this.setStatus("指令设备会话未就绪");
                } else if (message.type === "network" && message.userId === current.userId && message.data?.state === "DISCONNECTED") {
                    this.setStatus("指令设备网络已断开");
                }
            });
        });
    }

    private async startBatteryTelemetry(server: any) {
        try {
            const service = await server.getPrimaryService(BATTERY_SERVICE_UUID);
            const characteristic = await service.getCharacteristic(BATTERY_CHARACTERISTIC_UUID);
            characteristic.addEventListener("characteristicvaluechanged", (event: Event) => {
                const value = (event.target as any)?.value as DataView | undefined;
                if (value?.byteLength) {
                    this.updateBatteryLevel(value.getUint8(0));
                }
            });
            await characteristic.startNotifications();
            const value = await characteristic.readValue();
            if (value?.byteLength) {
                this.updateBatteryLevel(value.getUint8(0));
            }
        } catch {
            this.updateBatteryLevel(-1);
        }
    }

    private async startLegacyBatteryTelemetry(device: LegacyEmsDevice) {
        if (device.notifyCharacteristic) {
            device.notifyCharacteristic.addEventListener("characteristicvaluechanged", (event: Event) => {
                const batteryLevel = parseLegacyBatteryLevel((event.target as any)?.value);
                if (batteryLevel !== null) {
                    this.updateBatteryLevel(batteryLevel);
                }
            });
            await device.notifyCharacteristic.startNotifications();
        }
        await writePacket(device.characteristic, createLegacyBatteryQueryPacket());
        device.batteryTimer = window.setInterval(() => {
            void writePacket(device.characteristic, createLegacyBatteryQueryPacket()).catch(() => undefined);
        }, 15000);
    }

    private clearLegacyBatteryTimer(device: LegacyEmsDevice) {
        if (device.batteryTimer) {
            window.clearInterval(device.batteryTimer);
            device.batteryTimer = undefined;
        }
    }

    private async playRule(rule: EmsFeedbackRule) {
        const device = this.device;
        if (!device || (device.kind === "websocket" && !device.targetId)) {
            return;
        }

        if (device.kind === "command_websocket") {
            this.sendCommandId(device, rule);
            return;
        }

        const steps = rule.action === "waveform" && rule.steps.length
            ? rule.steps
            : [createStep(rule.durationMs, rule.channelA, rule.channelB)];
        const cappedSteps = steps.map((step) => capStepStrength(step, this.config.maxStrength));

        // 游戏事件统一排队播放，每段结束都归零，避免强度残留到下一次反馈。
        for (const step of cappedSteps) {
            if (device.kind === "websocket") {
                await this.playWebSocketStep(device, step);
            } else if (device.protocol === "dglab_v3") {
                await this.playV3Step(device, step);
            } else if (device.protocol === "dglab_v2") {
                await this.playV2Step(device, step);
            } else {
                await this.playLegacyStep(device, step);
            }
        }
    }

    private async playLegacyStep(device: LegacyEmsDevice, step: EmsFeedbackStep) {
        const legacyStep = capStepStrength(step, 180);
        await writePacket(device.characteristic, createLegacyPacket(legacyStep, device.protocol));
        await sleep(legacyStep.durationMs);
        await writePacket(device.characteristic, createLegacyStopPacket(device.protocol));
    }

    private async playV3Step(device: DglabV3Device, step: EmsFeedbackStep) {
        const packetCount = Math.max(1, Math.ceil(step.durationMs / 100));
        for (let index = 0; index < packetCount; index++) {
            // V3 每 100ms 需要一包 B0；首包绝对设置强度，后续包只续传波形。
            await writePacket(device.writeCharacteristic, createV3Packet(step, index === 0));
            await sleep(Math.min(100, step.durationMs - index * 100));
        }
        await writePacket(device.writeCharacteristic, createV3StopPacket());
    }

    private async playV2Step(device: DglabV2Device, step: EmsFeedbackStep) {
        await writePacket(device.strengthCharacteristic, createV2StrengthPacket(step.channelA, step.channelB));
        const packetCount = Math.max(1, Math.ceil(step.durationMs / 100));
        for (let index = 0; index < packetCount; index++) {
            // V2 的波形参数只生效 100ms，因此两个通道都按周期续写。
            await Promise.all([
                writePacket(device.waveACharacteristic, createV2WavePacket(step.channelAMode)),
                writePacket(device.waveBCharacteristic, createV2WavePacket(step.channelBMode)),
            ]);
            await sleep(Math.min(100, step.durationMs - index * 100));
        }
        await writePacket(device.strengthCharacteristic, createV2StrengthPacket(0, 0));
    }

    private async playWebSocketStep(device: DglabWebSocketDevice, step: EmsFeedbackStep) {
        this.sendWebSocketStrength(device, "A", step.channelA);
        this.sendWebSocketStrength(device, "B", step.channelB);
        this.sendWebSocketWave(device, "A", step.channelA, step.durationMs);
        this.sendWebSocketWave(device, "B", step.channelB, step.durationMs);
        await sleep(step.durationMs);
        this.sendWebSocketCommand(device, "clear-1");
        this.sendWebSocketCommand(device, "clear-2");
        this.sendWebSocketStrength(device, "A", 0);
        this.sendWebSocketStrength(device, "B", 0);
    }

    private sendWebSocketStrength(device: DglabWebSocketDevice, channel: "A" | "B", strength: number) {
        this.sendWebSocket(device, {
            type: 3,
            channel: channel === "A" ? 1 : 2,
            strength,
            message: "set channel",
        });
    }

    private sendWebSocketWave(device: DglabWebSocketDevice, channel: "A" | "B", strength: number, durationMs: number) {
        if (strength <= 0) {
            return;
        }
        const waves = Array.from({ length: Math.max(1, Math.ceil(durationMs / 100)) }, () => DGLAB_WAVE_HEX);
        this.sendWebSocket(device, {
            type: "clientMsg",
            channel,
            time: Math.max(0.1, durationMs / 1000),
            message: `${channel}:${JSON.stringify(waves)}`,
        });
    }

    private sendWebSocketCommand(device: DglabWebSocketDevice, command: string) {
        this.sendWebSocket(device, { type: 4, message: command });
    }

    private sendWebSocket(device: DglabWebSocketDevice, payload: Record<string, unknown>) {
        if (!device.targetId || device.socket.readyState !== WebSocket.OPEN) {
            throw new Error("DG-LAB APP 尚未绑定");
        }
        device.socket.send(JSON.stringify({ ...payload, clientId: device.clientId, targetId: device.targetId }));
    }

    private sendCommandId(device: CommandWebSocketDevice, rule: EmsFeedbackRule) {
        const commandId = rule.commandId.trim();
        if (!commandId) {
            throw new Error(`${EMS_FEEDBACK_EVENT_LABELS[rule.eventType]}未配置 commandId`);
        }
        if (device.socket.readyState !== WebSocket.OPEN) {
            throw new Error("指令 WebSocket 已断开");
        }
        // 指令服务只需要事件映射，不发送强度和时长参数。
        device.socket.send(JSON.stringify({
            type: "sendCommand",
            userId: device.userId,
            commandId,
        }));
    }

    private setStatus(status: string) {
        this.status = status;
        this.onStatusChange?.(status);
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
        if (raw) {
            return normalizeConfig(JSON.parse(raw));
        }
    } catch {
        // 本地配置损坏时回到安全默认值，不阻断游戏启动。
    }
    return normalizeConfig({ enabled: false, maxStrength: DEFAULT_MAX_STRENGTH, rules: DEFAULT_RULES });
}

function normalizeConfig(value: Partial<EmsFeedbackConfig>): EmsFeedbackConfig {
    const incomingRules = Array.isArray(value.rules) ? value.rules : [];
    const connection = value.connection;
    const transport = connection?.transport;
    return {
        enabled: Boolean(value.enabled),
        maxStrength: normalizeStrength(value.maxStrength ?? DEFAULT_MAX_STRENGTH),
        connection: {
            transport: transport === "websocket" || transport === "command_websocket" ? transport : "ble",
            websocketUrl: String(connection?.websocketUrl || DEFAULT_WEBSOCKET_URL).trim(),
            commandWebsocketUrl: String(connection?.commandWebsocketUrl || DEFAULT_COMMAND_WEBSOCKET_URL).trim(),
            commandUid: String(connection?.commandUid || "").trim(),
            commandToken: String(connection?.commandToken || "").trim(),
        },
        rules: DEFAULT_RULES.map((defaultRule) => {
            const incoming = incomingRules.find((item) => item.eventType === defaultRule.eventType);
            return normalizeRule({ ...defaultRule, ...incoming });
        }),
    };
}

function normalizeRule(value: Partial<EmsFeedbackRule> & { eventType: EmsFeedbackEventType }): EmsFeedbackRule {
    return {
        eventType: value.eventType,
        commandId: String(value.commandId || value.eventType).trim(),
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
        commandId: eventType,
        enabled: false,
        action: "fixed",
        channelA,
        channelB,
        durationMs,
        steps: [createStep(durationMs, channelA, channelB)],
    };
}

function createStep(durationMs: number, channelA: number, channelB: number, channelAMode = 1, channelBMode = 1): EmsFeedbackStep {
    return { durationMs, channelA, channelB, channelAMode, channelBMode };
}

function capStepStrength(step: EmsFeedbackStep, maxStrength: number): EmsFeedbackStep {
    const cap = normalizeStrength(maxStrength);
    return { ...step, channelA: Math.min(step.channelA, cap), channelB: Math.min(step.channelB, cap) };
}

function createV3Packet(step: EmsFeedbackStep, setStrength: boolean) {
    const frequency = [30, 30, 30, 30];
    const waveStrength = [50, 50, 50, 50];
    return new Uint8Array([
        0xb0,
        setStrength ? 0x0f : 0x00,
        step.channelA,
        step.channelB,
        ...frequency,
        ...(step.channelA > 0 ? waveStrength : [0, 0, 0, 0]),
        ...frequency,
        ...(step.channelB > 0 ? waveStrength : [0, 0, 0, 0]),
    ]);
}

function createV3StopPacket() {
    return createV3Packet(createStep(1, 0, 0), true);
}

function createV2StrengthPacket(channelA: number, channelB: number) {
    const strengthA = Math.min(2047, channelA * 7);
    const strengthB = Math.min(2047, channelB * 7);
    return uint24LittleEndian((strengthA << 11) | strengthB);
}

function createV2WavePacket(_mode: number) {
    const x = 5;
    const y = 95;
    const z = 15;
    return uint24LittleEndian((z << 15) | (y << 5) | x);
}

function createLegacyPacket(step: EmsFeedbackStep, protocol: "ems_v1" | "ems_v2") {
    return protocol === "ems_v1" ? createLegacyV1Packet(step) : createLegacyV2Packet(step);
}

function createLegacyV1Packet(step: EmsFeedbackStep) {
    const channel = resolveLegacyV1Channel(step);
    const useChannelB = channel === 0x02 || step.channelB > step.channelA;
    const strength = useChannelB ? step.channelB : step.channelA;
    const mode = useChannelB ? step.channelBMode : step.channelAMode;
    const bytes = [
        0x35, 0x11, channel, channel === 0x00 ? 0x00 : 0x01,
        high(strength), low(strength), mode, 0x00, 0x00,
    ];
    bytes.push(checksum(bytes));
    return new Uint8Array(bytes);
}

function createLegacyV2Packet(step: EmsFeedbackStep) {
    const bytes = [
        0x35, 0x11, 0x01,
        high(step.channelA), low(step.channelA), step.channelAMode,
        high(step.channelB), low(step.channelB), step.channelBMode,
    ];
    bytes.push(checksum(bytes));
    return new Uint8Array(bytes);
}

function createLegacyStopPacket(protocol: "ems_v1" | "ems_v2") {
    if (protocol === "ems_v1") {
        const bytes = [0x35, 0x11, 0x03, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00];
        bytes.push(checksum(bytes));
        return new Uint8Array(bytes);
    }
    return createLegacyV2Packet(createStep(1, 0, 0));
}

function createLegacyBatteryQueryPacket() {
    const bytes = [0x35, 0x71, 0x04];
    bytes.push(checksum(bytes));
    return new Uint8Array(bytes);
}

function parseLegacyBatteryLevel(value: DataView | undefined) {
    if (!value || value.byteLength < 4 || value.getUint8(0) !== 0x35 || value.getUint8(1) !== 0x71 || value.getUint8(2) !== 0x04) {
        return null;
    }
    return clampInt(value.getUint8(3), 0, 100, 0);
}

function resolveLegacyV1Channel(step: EmsFeedbackStep) {
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

function uint24LittleEndian(value: number) {
    return new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]);
}

function normalizeWebSocketUrl(value: string) {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        throw new Error("请输入有效的 ws:// 或 wss:// 地址");
    }
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
        throw new Error("WebSocket 地址必须以 ws:// 或 wss:// 开头");
    }
    if (window.location.protocol === "https:" && url.protocol !== "wss:") {
        throw new Error("HTTPS 页面必须使用 wss:// 地址");
    }
    if (url.pathname !== "/" || url.search || url.hash) {
        throw new Error("DG-LAB WebSocket 地址不能包含路径、参数或锚点");
    }
    return url.toString().replace(/\/$/, "");
}

function normalizeCommandWebSocketUrl(value: string) {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        throw new Error("请输入有效的指令 WebSocket 地址");
    }
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
        throw new Error("指令 WebSocket 地址必须以 ws:// 或 wss:// 开头");
    }
    if (window.location.protocol === "https:" && url.protocol !== "wss:") {
        throw new Error("HTTPS 页面必须使用 wss:// 指令地址");
    }
    return url.toString();
}

function parseWebSocketMessage(value: unknown): Record<string, any> | null {
    try {
        const parsed = JSON.parse(String(value));
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

async function writePacket(characteristic: any, packet: Uint8Array) {
    if (typeof characteristic.writeValueWithoutResponse === "function") {
        await characteristic.writeValueWithoutResponse(packet);
        return;
    }
    await characteristic.writeValue(packet);
}

function normalizeStrength(value: unknown) {
    return clampInt(value, 0, 200, 0);
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
