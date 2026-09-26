# 前后端工程师交付清单：Link 2 驻足事件联动

## 目标

Windows 上的 `link2_dwell_demo` 检测到老人持续驻足后，会产生 `presence.dwell` 事件并通过 HTTPS 上报到现有 CloudBase 服务。iPad 打开的老人端 `/frame` 页面需要从服务端取得该事件，显示主动对话邀请，并在老人确认后进入当前照片对应的 AI 对话。

Windows 端上报程序已经完成。以下内容需要前后端工程师提供。

## 一、后端工程师需要提供

### 1. 已部署的事件接收接口

请在现有 CloudBase 服务中实现并部署：

```text
POST https://memory-frame-demo-d7djiee0702b6c.service.tcloudbase.com/api
Content-Type: application/json
Authorization: Bearer <传感器令牌>
```

请求体约定：

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

成功时请返回任意 `2xx`，建议使用：

```json
{
  "accepted": true,
  "eventId": "5e9fb7e1-609a-4c77-adf5-b43988403dcc",
  "seq": 18
}
```

请提供：

- 最终接口地址；
- 成功状态码和响应 JSON；
- 已部署版本或部署时间；
- 可以根据 `eventId` 查询联调日志的方式。

### 2. 独立的传感器令牌

请签发专用于 Windows Link 2 设备的：

```text
PRESENCE_SENSOR_TOKEN
```

要求：

- 不复用 iPad 登录令牌、家庭账号密码或系统开通码；
- 绑定到指定家庭和目标相框；
- 服务端只保存令牌摘要；
- 支持撤销和轮换；
- 不写入源码、Git、普通文档或群聊。

请通过双方认可的私密渠道单独交付令牌。本交接文档中不要填写真实令牌。

### 3. 设备和家庭绑定信息

请确认：

```text
deviceId: living-room-link2
目标家庭：____________
目标相框设备：____________
```

如果最终使用其他 `deviceId`，请给出由小写/大写字母、数字、点、下划线或短横线组成的 1～64 字符标识。

### 4. 事件幂等、存储和过期机制

请完成并确认：

- 按 `eventId` 幂等写入，同一个事件的网络重试不能重复触发；
- 为目标家庭生成单调递增的 `seq`；
- 使用 CloudStore/CloudBase 短时存储，不能只保存在单个 Node 进程内存；
- 建议事件有效期为 10～15 秒；
- 以服务端 `receivedAt` 为主要时效依据；
- 过期事件不再向 iPad 下发；
- 不把驻足事件保存为长期老人行为记录；
- 限制请求体大小和上报频率；
- 严格校验 `version`、`type`、`deviceId`、`occurredAt`、`dwellMs` 和 `headCount`。

Windows 在网络失败时最多重试 5 次，退避时间为 1、2、4、8 秒，所有重试保持相同 `eventId`。

### 5. 给 iPad Web 的事件下发

三天 MVP 请优先复用现有约 3 秒一次的 `state` 轮询。在经过认证的相框角色响应中增加：

```json
{
  "presenceEvent": {
    "seq": 18,
    "eventId": "5e9fb7e1-609a-4c77-adf5-b43988403dcc",
    "type": "presence.dwell",
    "receivedAt": 1780000000100,
    "expiresAt": 1780000015100
  }
}
```

要求：

- 只向绑定的家庭和目标相框会话返回；
- 家人端、其他家庭或其他相框不能看到该事件；
- 事件过期或传感器被撤销后立即停止下发；
- 暂不要求 WebSocket 或 SSE，除非现有轮询延迟无法接受。

## 二、iPad Web 前端工程师需要提供

### 1. 驻足事件接收

请在老人端 `/frame` 页面读取服务端返回的 `state.presenceEvent`，并完成：

- 按 `seq` 或 `eventId` 去重；
- 页面刷新后也不能再次处理同一事件；
- 超过 `expiresAt` 的事件立即丢弃；
- 只在页面处于前台、登录有效并且当前有照片时处理；
- 正在录音、播放原声、家庭通话、AI 对话或已经显示邀请时不打断。

### 2. 主动邀请界面

收到有效事件后，请显示醒目、可关闭且适合老人操作的邀请，例如：

```text
检测到您正在看这张照片，要一起聊聊吗？

[和 AI 聊聊]  [暂时不用]
```

收到事件时需要固定当前照片 `messageId`，避免邀请显示期间照片自动切换后打开错误照片。

请提供：

- 邀请界面的最终文案和截图；
- 接受和拒绝按钮的处理方式；
- 页面忙碌时采用忽略、延迟还是排队策略；
- 已部署前端版本或部署时间。

### 3. 接入现有 AI 对话

老人确认邀请后，请调用现有接口：

```js
MemoryAI.open(messageId)
```

驻足事件不能直接申请麦克风或启动实时语音。麦克风仍需由老人点击明确开启。

如果产品要求 AI 自动提出第一句，请额外提供一个由 `MemoryAI` 模块内部实现的受控入口，例如：

```js
MemoryAI.openProactive(messageId)
```

该入口应负责：

- 打开对话窗口；
- 选择触发时固定的当前照片；
- 启用图片读取；
- 调用现有 `aiChat`；
- 生成一句简短、温和、开放式且不虚构照片事实的问题；
- 失败时回退到普通邀请，不影响相框继续展示照片。

不要从外部脚本模拟点击 AI 对话内部控件。

### 4. 最小诊断信息

请提供不会包含照片、人脸或聊天正文的诊断日志，至少能够区分：

- 事件收到；
- 事件重复；
- 事件过期；
- 因页面隐藏或业务忙碌而忽略；
- 邀请已经显示；
- 老人接受或拒绝；
- AI 对话打开成功或失败。

日志应包含 `eventId` 和 `seq`，方便与 Windows、CloudBase 三端核对。

## 三、联调前需要交付给 Windows 端的信息

请将以下非敏感信息集中回复：

```text
CloudBase 接口地址：
presenceReport 已部署：是 / 否
成功状态码：
deviceId：
目标家庭：
目标相框：
事件有效期：
iPad Web 已部署版本：
日志查询联系人：
联调时间：
```

`PRESENCE_SENSOR_TOKEN` 请通过私密渠道单独提供。

## 四、联调验收标准

- Windows 触发后打印 `captured presence.dwell`；
- CloudBase 返回 `2xx`，Windows 打印 `uploaded`；
- 后端可以按同一个 `eventId` 找到事件；
- iPad 最迟在下一次 `state` 轮询中收到事件；
- 同一事件只显示一次邀请；
- 老人确认后打开触发时照片对应的 AI 对话；
- 老人拒绝、页面后台、业务忙碌或事件过期时不启动对话；
- 摄像头画面、截图、头部坐标和人脸身份数据均不上传。
