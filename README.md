# dsh-tavern

**基于 DeepSeek Harness（DSH）的文字游戏 Agent，支持导入 SillyTavern 人物卡。**

选一张卡自由游玩，或绑定小说、剧本和大纲，让故事沿主线推进。也可以与 Agent 对话，从素材制作新卡，修改人物设定和世界书。

[使用文档](https://flizzywine.github.io/dsh-tavern/) · [入门指南](https://flizzywine.github.io/dsh-tavern/#a02) · [宣传视频](https://www.bilibili.com/video/BV1Bibx61EAC/) · [安装与排错](docs/installation.md) · [Discord 交流](https://discord.com/channels/1134557553011998840/1538577327028445194)

![dsh-tavern：左侧会话、中间游玩、右侧人物状态](docs/images/readme/overview.png)

## 可以做什么

- **自由游玩或跟随剧本**：自由输入，也可选择独立生成的行动候选；支持添加持续指导、带意见重写和回退。
- **对话式制作人物卡**：管理人物卡、世界书、预设和剧本，导入时保留原版，讨论确认后修改工作版。
- **使用酒馆人物卡**：支持 PNG / JSON 卡、正则美化、HTML 展示、MVU 后台变量更新和已适配的小手机；第三方脚本的兼容范围取决于具体接口。
- **为剧情配图**：手动生成场景插画，支持带意见重画和查看不同版本；需单独配置生图服务。

导入人物卡即可开始，默认使用内置预设。更多功能、界面截图和公开样例见[功能指南](https://flizzywine.github.io/dsh-tavern/#index)。

## 安装与更新

首次安装、更新或重新安装使用同一条命令，保留人物卡、对话和配置。

### DSH Desktop（Windows / macOS，推荐）

推荐 [DSH Desktop 2.0.5](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.5)，其他版本也允许安装；遇到兼容问题时可切换到推荐版本。

安装 Desktop 后，从系统托盘（macOS 菜单栏）打开 **Open DSH Terminal**，运行：

Windows：

```powershell
$env:DSH_TAVERN_HOST='desktop'; $tavernInstaller=[Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('https://cdn.jsdelivr.net/gh/flizzywine/dsh-tavern@main/install.ps1')); Invoke-Expression $tavernInstaller
```

macOS：

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/flizzywine/dsh-tavern@main/install.sh | DSH_TAVERN_HOST=desktop sh
```

完成后重启 Desktop，从托盘的 **Profile** 菜单选择 **tavern**。

### 命令行（Windows / macOS / Linux）

需要 **Node.js 22.19 或更高版本**，无需预装 DSH。安装器使用独立的 DSH `0.1.2-rc.1`，不修改全局 DSH。

Windows PowerShell：

```powershell
$env:DSH_TAVERN_HOST='cli'; $tavernInstaller=[Text.Encoding]::UTF8.GetString((New-Object Net.WebClient).DownloadData('https://cdn.jsdelivr.net/gh/flizzywine/dsh-tavern@main/install.ps1')); Invoke-Expression $tavernInstaller
```

macOS / Linux / WSL2：

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/flizzywine/dsh-tavern@main/install.sh | DSH_TAVERN_HOST=cli sh
```

安装后会自动启动并打开网页。以后使用：

```bash
dsh-tavern open      # 打开网页
dsh-tavern start     # 启动
dsh-tavern stop      # 停止
dsh-tavern restart   # 重启
dsh-tavern update    # 更新
```

运行时和数据默认保存在 `~/.dsh-tavern/`，与 Desktop / DSHA 分开，切换安装方式不会自动同步数据。备份、迁移、自定义目录和手动安装见[完整安装说明](docs/installation.md)。

### Android（实验性）

通过 [DSHA](https://github.com/DSH-APP/DSHA) 安装，推荐 **1.2.0-rc1.4**，不强制锁定版本。Android 属于实验性支持，不保证一定可用，步骤见 [Android 安装说明](docs/android-install.md)。

## 开始游玩

1. 在 **设置 → 模型** 中配置模型服务和 API 密钥。
2. 导入人物卡，选择人物卡开始游玩；也可以进入卡片工作台制作新卡。

[完整使用指南](https://flizzywine.github.io/dsh-tavern/)提供详细操作、截图和样例下载，文档网站本身不是在线游戏服务。

## 交流与反馈

欢迎到 [Discord 讨论频道](https://discord.com/channels/1134557553011998840/1538577327028445194)交流使用经验、分享人物卡或反馈问题。

反馈故障时，可从对话顶部的“日志”下载执行记录；分享前请检查其中的对话和附件隐私。
