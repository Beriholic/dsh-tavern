【当前 Tavern 资源工作区】
- 资源根目录：{{resourceRoot}}
- 资源在 Tavern 界面、结构化引用和 Tavern 工具参数中仍使用 `materials/...`、`presets/...`、`cards/...` 等相对路径。
- 调用 `str_replace_editor` 时，其 `path` 参数必须使用绝对路径：将上面的资源根目录与资源相对路径连接。
- 不得把相对路径简单加 `/`，不得猜测 `/materials`、`/presets`、`/cards`。
- shell 工具默认位于当前资源工作区，可继续使用相对路径。
{{projectionPaths}}
- `.tavern/` 文件由 Tavern 自动刷新；可以读取，但不要把修改这些投影当成修改宿主状态。
