# 本地工作流工具

本目录承载 Dashboard 背后的可执行基础能力，全部使用 Python 标准库。

## 实时热榜

复制 `config.example.json` 为 `config.local.json`，填写自部署的 DailyHotApi 地址：

```powershell
python workflow/hotlist.py --config workflow/config.local.json --platforms douyin,bilibili,weibo,zhihu
```

规则：请求失败、时间戳异常或返回空列表时，以非零状态退出；绝不把缓存内容伪装为实时结果。

## 内容资产库

```powershell
python workflow/content_store.py add --topic "选题" --title "标题" --script draft.txt --platforms 抖音,B站 --series "跨市场夜报"
python workflow/content_store.py list
python workflow/content_store.py search --query 半导体
python workflow/content_store.py metrics --id <内容ID> --views 100000 --likes 3200 --completion 0.41
```

数据默认保存在项目的 `data/content-store.json`。它是本地私有数据，不应提交到公开仓库。

