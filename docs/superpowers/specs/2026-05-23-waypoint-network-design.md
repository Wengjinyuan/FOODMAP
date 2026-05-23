# 个人传送网 (Personal Waypoint Network) — 设计文档

## 概述

一款个人地理位置标记工具，将喜欢的美食店/常去地点标记为地图上的「传送点 (Waypoint)」。首屏即地图，点击即传送（导航）。

- **定位**：个人工具，初期基于 OpenID 隔离数据，预留多人分享扩展
- **平台**：微信小程序 + CloudBase 云开发
- **视觉风格**：游戏化传送点概念，Marker 支持三种风格切换

## 架构

```
小程序前端 (3 pages)  →  wx.cloud.callFunction  →  waypointFunctions (云函数)
                              ↓
                         CloudBase 文档数据库 (waypoints)
                         CloudBase 云存储 (图片)
```

单一云函数处理所有 CRUD，数据库文档天然通过 `_openid` 隔离用户。

## 页面结构

### 地图首页 (pages/home) — TabBar
- 全屏 `<map>` 组件，所有传送点以 Marker 渲染
- 底部可拖拽半屏抽屉：附近传送点卡片列表（按距离排序）
- 悬浮搜索栏：按名称/分类搜索
- 悬浮 + 按钮：激活新传送点入口
- 点击 Marker → 弹出传送点名片 → 点击进入详情
- 下拉刷新地图数据

### 添加/详情页 (pages/detail) — 双模式复用
- **查看模式**：传送点完整信息 + 图片轮播 + 「开始传送」导航按钮 + 编辑/删除操作
- **编辑模式**：表单（名称/分类/标签/备注）+ 地图选点 (wx.chooseLocation) + 图片上传 (wx.cloud.uploadFile)

### 我的页面 (pages/mine) — TabBar
- 传送点统计（总数、分类分布）
- 我的传送点列表（按分类筛选、按时间/距离排序）
- Marker 风格切换（游戏风 / 简约 / 编号）
- 数据导出预留

## 数据模型

### waypoints 集合

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | auto | 自动生成 |
| _openid | string | 创建者微信 OpenID（自动） |
| name | string | 传送点名称 |
| category | string | 分类（预定义 + 自定义） |
| location | GeoPoint | 经纬度坐标 |
| address | string | 详细地址 |
| images | array\<string\> | 云存储 fileID 列表 |
| notes | string | 备注/评价 |
| tags | array\<string\> | 自定义标签 |
| rating | number | 评分 1-5 |
| create_time | Date | 创建时间 |
| update_time | Date | 更新时间 |

**索引**：location 字段建 geo 索引（附近搜索），category 建普通索引（分类筛选）

### 预定义分类
`["美食", "咖啡", "风景", "根据地", "购物", "娱乐", "其他"]`

### 用户偏好（本地存储）
- `markerStyle`: "game" | "minimal" | "numbered"

## 云存储结构

```
restaurant-images/  ← 传送点图片 (wx.cloud.uploadFile)
```

## 云函数

### waypointFunctions — action 分发

| action | 功能 | 参数 |
|--------|------|------|
| getNearbyWaypoints | 按地理位置附近查询 | latitude, longitude, maxDistance, skip, limit |
| searchWaypoints | 按名称/分类搜索 | keyword, category, skip, limit |
| getWaypointDetail | 获取单个详情 | waypointId |
| addWaypoint | 新增传送点 | name, category, location, address, images, notes, tags, rating |
| updateWaypoint | 更新传送点 | waypointId + 更新字段 |
| deleteWaypoint | 删除传送点 | waypointId |
| getMyWaypoints | 获取我的列表 | category, orderBy, skip, limit |
| getWaypointStats | 获取统计 | 无（按分类统计数量） |

## 交互流程

1. **激活传送**：首页 + → 地图选点 → 填信息 → 上传图片 → 保存 → 地图刷新
2. **查看传送**：点击 Marker/卡片 → 详情页 → 「传送」→ wx.openLocation 导航
3. **管理传送**：我的 → 筛选 → 编辑 → 修改/删除

## 非功能性

- 地图 Marker 数量优化：超过 50 个时考虑聚合展示
- 图片上传前压缩（wx.chooseMedia sizeType: compressed）
- 云数据库权限：读「所有用户可读」，写「仅创建者可写」

## 审核记录

| 日期 | 决策 | 详情 |
|------|------|------|
| 2026-05-23 | 首页布局 | 地图 + 底部抽屉 (方案 B) |
| 2026-05-23 | Marker 风格 | 三种风格 (游戏风/简约/编号) + 用户切换 |
| 2026-05-23 | 分类系统 | 预定义 + 自定义混合 (方案 C) |
| 2026-05-23 | 项目架构 | 从零开始，保留 CloudBase 初始化 |
