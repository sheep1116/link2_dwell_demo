# Link 2 驻足事件云端上报交接

## Windows 端已完成

`presence_uploader.cjs` 是 Link 2 Demo 的独立包装程序，不修改摄像头、SDK、视频流或驻足判断代码。它负责：

1. 启动现有 `link2_dwell_demo.exe`，保证仍然只有一个进程打开 Link 2；
2. 逐行读取 Demo 标准输出，只处理 `EVENT:` 开头的 JSON；
3. 校验 `presence.dwell`、时间、驻足时长和 Link SDK 的 0～10 头部数量范围；
4. 为每次触发生成 UUID `eventId`，通过 HTTPS POST 到 CloudBase；
5. 网络失败时最多尝试 5 次，退避 1、2、4、8 秒；同一事件的重试保持相同 `eventId`；
6. 不上传视频、截图、头部坐标或人脸信息，也不记录传感器令牌。

入口：

- `start-cloud-uploader.ps1`：Windows 启动脚本；
- `presence_uploader.cjs`：上报程序；
- `test/presence_uploader.test.cjs`：解析、接口结构、安全和重试测试。

## Demo 原始事件

Demo 当前输出：

```text
EVENT:{"type":"presence.dwell","timestamp":1780000000000,"dwellMs":4200,"headCount":1}
```

字段含义：

| 字段 | 含义 |
| --- | --- |
| `type` | 固定为 `presence.dwell` |
| `timestamp` | Windows 检测程序触发时的 Unix 毫秒时间 |
| `dwellMs` | 本次连续驻足时长 |
| `headCount` | SDK 本次返回的原始头部框数量；不是身份或注视结果 |

## CloudBase 接口约定

默认地址：

```text
POST https://memory-frame-demo-d7djiee0702b6c.service.tcloudbase.com/api
Authorization: Bearer <PRESENCE_SENSOR_TOKEN>
Content-Type: application/json
```

请求体：

```json
{
  "action": "presenceReport",
  "data": {
    "version": 1,
    "eventId": "5e9fb7e1-609a-4c77-adf5-b43988403dcc",
    "source": "link2-windows",
    "deviceId": "living-room-link2",
    "type": "presence.dwell",
    "occurredAt": 1780000000000,
    "dwellMs": 4200,
    "headCount": 1
  }
}
```

服务端成功时应返回任意 `2xx`，推荐：

```json
{"accepted":true,"eventId":"5e9fb7e1-609a-4c77-adf5-b43988403dcc","seq":18}
```

非 `2xx` 会被视为失败。服务端必须按 `eventId` 幂等处理，因为网络中断可能造成同一请求重试。

## Windows 启动

先构建 Demo，然后由上报器启动它，不要另外手动运行第二份 Demo：

```powershell
cd G:\unseen_project\demos\link2_dwell_demo
.\build.ps1
$env:PRESENCE_SENSOR_TOKEN = '<服务端工程师签发的令牌>'
$env:PRESENCE_DEVICE_ID = 'living-room-link2'
.\start-cloud-uploader.ps1
```

服务端尚未完成时，可以验证事件解析而不联网：

```powershell
.\start-cloud-uploader.ps1 -DryRun
```

也可以不启动摄像头，向标准输入送一条测试事件：

```powershell
'EVENT:{"type":"presence.dwell","timestamp":1780000000000,"dwellMs":4200,"headCount":1}' |
  node .\presence_uploader.cjs --stdin --once --dry-run
```

## 服务端工程师待完成

1. 在现有 `/api` 路由中增加 `presenceReport`，并且在普通家庭 `session(token)` 校验之前识别独立传感器令牌；不要复用 iPad 登录令牌或开通码。
2. 将传感器 `deviceId` 安全映射到一个家庭和目标相框；令牌只保存摘要，支持撤销和轮换。
3. 严格校验请求字段、限制体积和频率，并以服务端 `receivedAt` 为准判断事件是否新鲜。
4. 使用 CloudStore/CloudBase 持久化短时事件，不要只保存在 Node 进程内存；云端可能重启或多实例运行。
5. 以 `eventId` 幂等写入并生成家庭内单调递增的 `seq`。建议 10～15 秒过期，不保存为长期行为记录。
6. 在相框角色的现有 `state` 响应中返回未过期的最新事件，例如：

```json
{"presenceEvent":{"seq":18,"eventId":"...","type":"presence.dwell","receivedAt":1780000000100,"expiresAt":1780000015100}}
```

7. 只向目标家庭、目标相框会话下发。事件过期、设备撤销或家庭不匹配时不得返回。

三天 MVP 优先复用 Web 已有约 3 秒一次的 `state` 轮询。暂不需要 WebSocket/SSE；后续如确实需要亚秒延迟再升级。

## iPad Web 工程师待完成

1. 从 `state.presenceEvent` 读取事件，用 `seq` 或 `eventId` 去重；页面刷新后也不能重复弹出同一事件。
2. 只在 `/frame`、页面可见、登录有效且当前有照片时处理；事件超过 `expiresAt` 立即丢弃。
3. 正在录音、播放原声、家庭通话、AI 实时对话或已有邀请时不打断。
4. 收到事件时固定当前照片 ID，显示明显但可关闭的邀请，例如“想聊聊这张照片吗？”。
5. 老人确认后调用现有 `MemoryAI.open(messageId)`；驻足事件不能直接开麦。
6. 如果要让 AI 自动提出第一句，需要在 `MemoryAI` 内增加受控入口：选择当前照片、启用图片读取、调用现有 `aiChat` 生成一句简短开放式问题。不要从外部脚本模拟点击内部控件。
7. 对“事件收到、被门禁忽略、邀请显示、老人接受/拒绝”增加不含照片和人脸信息的最小诊断日志。

## 联调验收

- Demo 调试界面正常显示，且只有它打开 Link 2；
- 触发时上报器打印 `captured`，服务端完成后打印 `uploaded ... status=2xx`；
- 同一 `eventId` 重试不会在 iPad 重复邀请；
- iPad 最迟在下一次状态轮询收到事件；
- 过期事件、后台页面、忙碌状态和非目标家庭不会触发；
- 全链路不上传摄像头画面、头部框或人脸身份数据。
