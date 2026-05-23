# 个人传送网 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零构建"个人传送网"微信小程序——地图首屏，传送点标记，一键导航。

**Architecture:** 3 页面（地图首页 + 详情/编辑 + 我的），1 个云函数 `waypointFunctions`，CloudBase 文档数据库 `waypoints` 集合 + 云存储图片。

**Tech Stack:** 微信小程序原生 (WXML/WXSS/JS) + 微信云开发 CloudBase + `<map>` 组件

---

### Task 1: 清理旧代码，搭建项目骨架

**Files:**
- Remove: `miniprogram/pages/index/`
- Remove: `miniprogram/pages/example/`
- Remove: `miniprogram/pages/home/`, `miniprogram/pages/detail/`, `miniprogram/pages/add/`, `miniprogram/pages/mine/`
- Remove: `cloudfunctions/quickstartFunctions/`, `cloudfunctions/foodFunctions/`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/app.js`
- Modify: `miniprogram/app.wxss`
- Modify: `project.config.json`
- Create: `miniprogram/pages/home/`, `miniprogram/pages/detail/`, `miniprogram/pages/mine/`

- [x] **Step 1: 删除旧页面和云函数**

```bash
rm -rf miniprogram/pages/index miniprogram/pages/example miniprogram/pages/home miniprogram/pages/detail miniprogram/pages/add miniprogram/pages/mine
rm -rf cloudfunctions/quickstartFunctions cloudfunctions/foodFunctions
```

- [x] **Step 2: 创建新页面目录**

```bash
mkdir -p miniprogram/pages/home miniprogram/pages/detail miniprogram/pages/mine
```

- [x] **Step 3: 重写 app.json — 2 Tab 结构**

```json
{
  "pages": [
    "pages/home/home",
    "pages/detail/detail",
    "pages/mine/mine"
  ],
  "window": {
    "backgroundColor": "#1A1A2E",
    "backgroundTextStyle": "dark",
    "navigationBarBackgroundColor": "#1A1A2E",
    "navigationBarTitleText": "传送网",
    "navigationBarTextStyle": "white"
  },
  "tabBar": {
    "color": "#666666",
    "selectedColor": "#00D4FF",
    "backgroundColor": "#1A1A2E",
    "borderStyle": "black",
    "list": [
      {
        "pagePath": "pages/home/home",
        "text": "地图",
        "iconPath": "images/icons/home.png",
        "selectedIconPath": "images/icons/home-active.png"
      },
      {
        "pagePath": "pages/mine/mine",
        "text": "我的",
        "iconPath": "images/icons/usercenter.png",
        "selectedIconPath": "images/icons/usercenter-active.png"
      }
    ]
  },
  "sitemapLocation": "sitemap.json",
  "style": "v2",
  "lazyCodeLoading": "requiredComponents"
}
```

- [x] **Step 4: 更新 app.js — 保留 CloudBase 初始化，精简**

```javascript
// app.js
App({
  onLaunch: function () {
    const envId = "";
    this.globalData = {
      env: envId,
      isCloudReady: false,
      markerStyle: "game",
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({ env: envId, traceUser: true });
      this.globalData.isCloudReady = !!envId;
      if (!envId) {
        console.warn("云开发环境 ID 未配置，请在 app.js 中填入您的环境 ID");
      }
    }
  },

  getDb: function () {
    return wx.cloud.database();
  },

  callFunction: function (name, data) {
    return wx.cloud.callFunction({ name, data });
  },
});
```

- [x] **Step 5: 重写 app.wxss — 暗色主题全局样式**

```css
page {
  background: #0F0F23;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 28rpx;
  color: #E0E0E0;
  line-height: 1.5;
}
button { background: initial; padding: 0; margin: 0; line-height: inherit; }
button:focus { outline: 0; }
button::after { border: none; }
.text-primary { color: #00D4FF; }
.text-muted { color: #888888; }
```

- [x] **Step 6: 更新 project.config.json — 项目名**

```json
{
  "projectname": "personal-waypoint-network"
}
```

- [x] **Step 7: 提交**

```bash
git add -A && git commit -m "feat: clean up old code, scaffold waypoint project skeleton"
```

---

### Task 2: 创建云函数 waypointFunctions

**Files:**
- Create: `cloudfunctions/waypointFunctions/package.json`
- Create: `cloudfunctions/waypointFunctions/config.json`
- Create: `cloudfunctions/waypointFunctions/index.js`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "waypointFunctions",
  "version": "1.0.0",
  "description": "个人传送网核心云函数",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

- [ ] **Step 2: 创建 config.json**

```json
{
  "permissions": {
    "openapi": ["security.msgSecCheck"]
  }
}
```

- [ ] **Step 3: 创建 index.js — 完整云函数逻辑**

```javascript
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PRESET_CATEGORIES = ["美食", "咖啡", "风景", "根据地", "购物", "娱乐", "其他"];

// ── 附近传送点 ──
const getNearbyWaypoints = async (event) => {
  const { latitude, longitude, maxDistance = 5000, skip = 0, limit = 20 } = event;
  const result = await db.collection("waypoints")
    .where({
      location: _.geoNear({
        geometry: db.Geo.Point(latitude, longitude),
        minDistance: 0,
        maxDistance,
      }),
    })
    .skip(skip).limit(limit).get();
  return { success: true, data: result.data };
};

// ── 搜索传送点 ──
const searchWaypoints = async (event) => {
  const { keyword = "", category = "", skip = 0, limit = 20 } = event;
  const conditions = [];
  if (keyword) conditions.push({ name: db.RegExp({ regexp: keyword, options: "i" }) });
  if (category) conditions.push({ category });
  const query = conditions.length > 0 ? _.and(conditions) : {};
  const result = await db.collection("waypoints").where(query).skip(skip).limit(limit).get();
  return { success: true, data: result.data };
};

// ── 传送点详情 ──
const getWaypointDetail = async (event) => {
  const { waypointId } = event;
  const doc = await db.collection("waypoints").doc(waypointId).get();
  if (!doc.data) return { success: false, errMsg: "传送点不存在" };
  return { success: true, data: doc.data };
};

// ── 新增传送点 ──
const addWaypoint = async (event) => {
  const wxContext = cloud.getWXContext();
  const { name, category, latitude, longitude, address, images, notes, tags, rating } = event;
  if (!name || !category || latitude == null || longitude == null) {
    return { success: false, errMsg: "名称、分类和位置为必填项" };
  }
  const now = new Date();
  const res = await db.collection("waypoints").add({
    data: {
      name,
      category,
      location: db.Geo.Point(latitude, longitude),
      address: address || "",
      images: images || [],
      notes: notes || "",
      tags: tags || [],
      rating: Number(rating) || 0,
      _openid: wxContext.OPENID,
      create_time: now,
      update_time: now,
    },
  });
  return { success: true, data: { _id: res._id } };
};

// ── 更新传送点 ──
const updateWaypoint = async (event) => {
  const wxContext = cloud.getWXContext();
  const { waypointId, name, category, latitude, longitude, address, images, notes, tags, rating } = event;

  const doc = await db.collection("waypoints").doc(waypointId).get();
  if (!doc.data) return { success: false, errMsg: "传送点不存在" };
  if (doc.data._openid !== wxContext.OPENID) return { success: false, errMsg: "无权修改" };

  const updateData = { update_time: new Date() };
  if (name !== undefined) updateData.name = name;
  if (category !== undefined) updateData.category = category;
  if (latitude != null && longitude != null) updateData.location = db.Geo.Point(latitude, longitude);
  if (address !== undefined) updateData.address = address;
  if (images !== undefined) updateData.images = images;
  if (notes !== undefined) updateData.notes = notes;
  if (tags !== undefined) updateData.tags = tags;
  if (rating !== undefined) updateData.rating = Number(rating);

  await db.collection("waypoints").doc(waypointId).update({ data: updateData });
  return { success: true };
};

// ── 删除传送点 ──
const deleteWaypoint = async (event) => {
  const wxContext = cloud.getWXContext();
  const { waypointId } = event;
  const doc = await db.collection("waypoints").doc(waypointId).get();
  if (!doc.data) return { success: false, errMsg: "传送点不存在" };
  if (doc.data._openid !== wxContext.OPENID) return { success: false, errMsg: "无权删除" };
  await db.collection("waypoints").doc(waypointId).remove();
  return { success: true };
};

// ── 我的传送点 ──
const getMyWaypoints = async (event) => {
  const wxContext = cloud.getWXContext();
  const { category = "", orderBy = "create_time", skip = 0, limit = 50 } = event;
  const query = { _openid: wxContext.OPENID };
  if (category) query.category = category;
  const result = await db.collection("waypoints").where(query).orderBy(orderBy, "desc").skip(skip).limit(limit).get();
  return { success: true, data: result.data };
};

// ── 统计 ──
const getMyStats = async () => {
  const wxContext = cloud.getWXContext();
  const all = await db.collection("waypoints").where({ _openid: wxContext.OPENID }).get();
  const categoryCount = {};
  all.data.forEach((wp) => {
    categoryCount[wp.category] = (categoryCount[wp.category] || 0) + 1;
  });
  return { success: true, data: { total: all.data.length, categories: categoryCount } };
};

// ── 获取预定义分类 ──
const getPresetCategories = async () => {
  return { success: true, data: PRESET_CATEGORIES };
};

// ── 主入口 ──
exports.main = async (event, context) => {
  switch (event.action) {
    case "getNearbyWaypoints": return await getNearbyWaypoints(event);
    case "searchWaypoints": return await searchWaypoints(event);
    case "getWaypointDetail": return await getWaypointDetail(event);
    case "addWaypoint": return await addWaypoint(event);
    case "updateWaypoint": return await updateWaypoint(event);
    case "deleteWaypoint": return await deleteWaypoint(event);
    case "getMyWaypoints": return await getMyWaypoints(event);
    case "getMyStats": return await getMyStats();
    case "getPresetCategories": return await getPresetCategories();
    default: return { success: false, errMsg: "未知操作" };
  }
};
```

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/waypointFunctions/ && git commit -m "feat: create waypointFunctions cloud function"
```

---

### Task 3: 地图首页 (pages/home) — 地图 + 底部抽屉 + 悬浮按钮

这是最核心的页面。先出 HTML 预览给用户确认，再写小程序代码。

**Files:**
- Create: `miniprogram/pages/home/home.json`
- Create: `miniprogram/pages/home/home.js`
- Create: `miniprogram/pages/home/home.wxml`
- Create: `miniprogram/pages/home/home.wxss`

- [ ] **Step 1: 输出 HTML 预览确认交互布局**

预览包含：暗色主题地图区域、底部半屏抽屉（可拖拽）、悬浮搜索栏和 + 按钮、Marker 点击弹出的名片卡片。

- [ ] **Step 2: 创建 home.json**

```json
{
  "usingComponents": {},
  "navigationStyle": "custom",
  "disableScroll": true
}
```

- [ ] **Step 3: 创建 home.js**

```javascript
const app = getApp();

Page({
  data: {
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 14,
    markers: [],
    waypoints: [],
    drawerHeight: 240,  // 抽屉展开高度 (rpx)
    drawerCollapsed: false,
    searchKeyword: "",
    activeCategory: "",
    categories: [],
    selectedWaypoint: null,
    loading: true,
  },

  onLoad() {
    this.loadCategories();
    this.getCurrentLocation();
  },

  onShow() {
    if (this.data.latitude) this.loadWaypoints();
  },

  // 获取当前位置
  getCurrentLocation() {
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        this.setData({ latitude: res.latitude, longitude: res.longitude });
        this.loadWaypoints();
      },
      fail: () => {
        this.loadWaypoints(); // 用默认位置
      },
    });
  },

  // 加载附近传送点
  loadWaypoints() {
    this.setData({ loading: true });
    const { latitude, longitude, searchKeyword, activeCategory } = this.data;

    const action = searchKeyword || activeCategory ? "searchWaypoints" : "getNearbyWaypoints";
    const params = {
      action,
      latitude, longitude,
      skip: 0, limit: 50,
      keyword: searchKeyword,
      category: activeCategory,
    };

    app.callFunction("waypointFunctions", params).then((res) => {
      if (res.result.success) {
        const waypoints = res.result.data;
        const markers = this.buildMarkers(waypoints);
        this.setData({ waypoints, markers, loading: false });
      } else {
        this.setData({ loading: false });
      }
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: "加载失败", icon: "none" });
    });
  },

  // 构建 Marker 数据
  buildMarkers(waypoints) {
    const style = app.globalData.markerStyle || "game";
    return waypoints.map((wp, index) => {
      const loc = wp.location;
      const lat = loc.latitude || loc.coordinates[1];
      const lng = loc.longitude || loc.coordinates[0];
      const colors = { "美食": "#FF6B35", "咖啡": "#8B5E3C", "风景": "#10B981", "根据地": "#6366F1", "购物": "#F59E0B", "娱乐": "#EC4899", "其他": "#6B7280" };
      const color = colors[wp.category] || "#6B7280";

      if (style === "numbered") {
        return {
          id: index,
          latitude: lat, longitude: lng,
          iconPath: "",
          width: 1, height: 1,
          label: { content: String(index + 1), color: "#FFFFFF", fontSize: 14, bgColor: color, borderRadius: 20, padding: 8, display: "ALWAYS" },
          callout: { content: wp.name, color: "#FFFFFF", fontSize: 12, bgColor: "#1A1A2E", borderRadius: 8, padding: 6, display: "BYCLICK" },
        };
      } else if (style === "game") {
        const emojis = { "美食": "🍜", "咖啡": "☕", "风景": "🏔️", "根据地": "🏠", "购物": "🛍️", "娱乐": "🎮", "其他": "📍" };
        const emoji = emojis[wp.category] || "📍";
        return {
          id: index,
          latitude: lat, longitude: lng,
          iconPath: "",
          width: 1, height: 1,
          label: { content: emoji, color: color, fontSize: 20, bgColor: "transparent", borderRadius: 0, padding: 4, display: "ALWAYS" },
          callout: { content: wp.name, color: "#FFFFFF", fontSize: 12, bgColor: "#1A1A2E", borderRadius: 8, padding: 6, display: "BYCLICK" },
        };
      } else {
        // minimal
        return {
          id: index,
          latitude: lat, longitude: lng,
          iconPath: "",
          width: 1, height: 1,
          label: { content: "▼", color: color, fontSize: 18, bgColor: "transparent", borderRadius: 0, padding: 2, display: "ALWAYS" },
          callout: { content: wp.name, color: "#FFFFFF", fontSize: 12, bgColor: "#1A1A2E", borderRadius: 8, padding: 6, display: "BYCLICK" },
        };
      }
    });
  },

  // 加载分类
  loadCategories() {
    app.callFunction("waypointFunctions", { action: "getPresetCategories" }).then((res) => {
      if (res.result.success) this.setData({ categories: res.result.data });
    });
  },

  // 搜索
  onSearchInput(e) { this.setData({ searchKeyword: e.detail.value }); },
  onSearchConfirm() { this.loadWaypoints(); },

  // 分类筛选
  onCategoryTap(e) {
    const cat = e.currentTarget.dataset.category;
    this.setData({ activeCategory: this.data.activeCategory === cat ? "" : cat });
    this.loadWaypoints();
  },

  // 抽屉拖拽
  onDrawerDrag(e) {
    const height = Math.max(120, Math.min(600, e.detail.y));
    this.setData({ drawerHeight: height });
  },

  // Marker 点击
  onMarkerTap(e) {
    const wp = this.data.waypoints[e.detail.markerId];
    if (wp) this.setData({ selectedWaypoint: wp });
  },

  // 卡片点击 → 详情
  onWaypointTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  // 激活新传送点
  onAddWaypoint() {
    wx.navigateTo({ url: "/pages/detail/detail?mode=add" });
  },

  // 地图区域变化
  onMapRegionChange(e) {
    if (e.type === "end") {
      this.setData({ latitude: e.detail.centerLocation.latitude, longitude: e.detail.centerLocation.longitude });
    }
  },
});
```

- [ ] **Step 4: 创建 home.wxml**

```xml
<view class="page">
  <!-- 全屏地图 -->
  <map id="waypointMap"
    class="map"
    latitude="{{latitude}}" longitude="{{longitude}}"
    scale="{{scale}}"
    markers="{{markers}}"
    show-location="{{true}}"
    bindmarkertap="onMarkerTap"
    bindregionchange="onMapRegionChange"
  />

  <!-- 悬浮搜索栏 -->
  <view class="search-bar">
    <input class="search-input" placeholder="搜索传送点..." value="{{searchKeyword}}"
      bindinput="onSearchInput" bindconfirm="onSearchConfirm" confirm-type="search" />
    <view class="search-btn" bindtap="onSearchConfirm">
      <text>🔍</text>
    </view>
  </view>

  <!-- 悬浮 + 按钮 -->
  <view class="add-btn" bindtap="onAddWaypoint">
    <text class="add-icon">+</text>
  </view>

  <!-- Marker 选中名片 -->
  <view class="marker-callout" wx:if="{{selectedWaypoint}}" bindtap="onWaypointTap" data-id="{{selectedWaypoint._id}}">
    <view class="callout-close" catchtap="onCalloutClose">✕</view>
    <text class="callout-name">{{selectedWaypoint.name}}</text>
    <view class="callout-meta">
      <text class="callout-category">{{selectedWaypoint.category}}</text>
      <text class="callout-rating" wx:if="{{selectedWaypoint.rating > 0}}">⭐ {{selectedWaypoint.rating}}</text>
    </view>
    <text class="callout-hint">点击查看详情 ▶</text>
  </view>

  <!-- 底部抽屉 -->
  <view class="drawer" style="height: {{drawerHeight}}rpx;" bindtouchmove="onDrawerDrag">
    <view class="drawer-handle">
      <view class="drawer-line"></view>
    </view>

    <!-- 分类筛选 -->
    <scroll-view class="category-row" scroll-x enable-flex>
      <view class="category-item {{activeCategory === '' ? 'active' : ''}}" bindtap="onCategoryTap" data-category="">全部</view>
      <view class="category-item {{activeCategory === item ? 'active' : ''}}"
        wx:for="{{categories}}" wx:key="*this" bindtap="onCategoryTap" data-category="{{item}}">
        {{item}}
      </view>
    </scroll-view>

    <!-- 传送点列表 -->
    <scroll-view class="drawer-list" scroll-y>
      <block wx:if="{{waypoints.length > 0}}">
        <view class="waypoint-card" wx:for="{{waypoints}}" wx:key="_id"
          bindtap="onWaypointTap" data-id="{{item._id}}">
          <image class="card-thumb" src="{{item.images[0] || '/images/default-goods-image.png'}}" mode="aspectFill" />
          <view class="card-body">
            <text class="card-name">{{item.name}}</text>
            <view class="card-info">
              <text class="card-category">{{item.category}}</text>
              <text class="card-rating" wx:if="{{item.rating > 0}}">⭐{{item.rating}}</text>
            </view>
            <text class="card-address">{{item.address}}</text>
          </view>
          <text class="card-arrow">▶</text>
        </view>
      </block>
      <view class="empty-drawer" wx:elif="{{!loading}}">
        <text>附近暂无传送点</text>
        <text class="empty-hint">点击 + 激活第一个传送点</text>
      </view>
    </scroll-view>
  </view>
</view>
```

- [ ] **Step 5: 创建 home.wxss**

```css
.page { width: 100vw; height: 100vh; overflow: hidden; position: relative; }

/* 地图 */
.map { width: 100%; height: 100%; }

/* 搜索栏 */
.search-bar {
  position: absolute; top: 80rpx; left: 24rpx; right: 24rpx;
  display: flex; align-items: center; gap: 12rpx; z-index: 10;
}
.search-input {
  flex: 1; height: 72rpx; background: rgba(26,26,46,0.9);
  border: 1rpx solid rgba(0,212,255,0.3); border-radius: 36rpx;
  padding: 0 28rpx; font-size: 28rpx; color: #FFFFFF;
}
.search-btn {
  width: 72rpx; height: 72rpx; background: rgba(0,212,255,0.2);
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
}

/* 添加按钮 */
.add-btn {
  position: absolute; bottom: 320rpx; right: 32rpx;
  width: 100rpx; height: 100rpx; background: linear-gradient(135deg, #00D4FF, #0099CC);
  border-radius: 50%; box-shadow: 0 8rpx 24rpx rgba(0,212,255,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 10;
}
.add-icon { font-size: 56rpx; color: #FFFFFF; font-weight: 300; }

/* Marker 名片 */
.marker-callout {
  position: absolute; bottom: 340rpx; left: 24rpx; right: 120rpx;
  background: rgba(26,26,46,0.95); border: 1rpx solid rgba(0,212,255,0.4);
  border-radius: 16rpx; padding: 20rpx 24rpx; z-index: 11;
}
.callout-close { position: absolute; top: 12rpx; right: 16rpx; color: #888; font-size: 24rpx; }
.callout-name { font-size: 30rpx; font-weight: 600; color: #FFFFFF; }
.callout-meta { display: flex; gap: 16rpx; margin-top: 8rpx; }
.callout-category { font-size: 24rpx; color: #00D4FF; background: rgba(0,212,255,0.1); padding: 4rpx 12rpx; border-radius: 4rpx; }
.callout-rating { font-size: 24rpx; color: #FFD700; }
.callout-hint { font-size: 22rpx; color: #00D4FF; margin-top: 8rpx; }

/* 底部抽屉 */
.drawer {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: linear-gradient(180deg, rgba(26,26,46,0.98), rgba(15,15,35,0.99));
  border-radius: 24rpx 24rpx 0 0; z-index: 9;
  display: flex; flex-direction: column;
}
.drawer-handle { display: flex; justify-content: center; padding: 16rpx 0; }
.drawer-line { width: 48rpx; height: 4rpx; background: rgba(255,255,255,0.2); border-radius: 2rpx; }

/* 分类行 */
.category-row { display: flex; white-space: nowrap; padding: 8rpx 24rpx 16rpx; }
.category-item {
  display: inline-flex; padding: 8rpx 24rpx; margin-right: 12rpx;
  background: rgba(255,255,255,0.06); border-radius: 28rpx;
  font-size: 24rpx; color: #888; flex-shrink: 0;
}
.category-item.active { background: rgba(0,212,255,0.15); color: #00D4FF; font-weight: 600; }

/* 卡片列表 */
.drawer-list { flex: 1; padding: 0 24rpx; overflow-y: auto; }
.waypoint-card {
  display: flex; align-items: center; padding: 16rpx; margin-bottom: 12rpx;
  background: rgba(255,255,255,0.04); border-radius: 12rpx;
  border: 1rpx solid rgba(255,255,255,0.06);
}
.card-thumb { width: 100rpx; height: 100rpx; border-radius: 10rpx; flex-shrink: 0; background: rgba(255,255,255,0.1); }
.card-body { flex: 1; margin-left: 16rpx; }
.card-name { font-size: 28rpx; font-weight: 600; color: #FFFFFF; }
.card-info { display: flex; gap: 12rpx; margin-top: 4rpx; }
.card-category { font-size: 22rpx; color: #00D4FF; background: rgba(0,212,255,0.1); padding: 2rpx 10rpx; border-radius: 4rpx; }
.card-rating { font-size: 22rpx; color: #FFD700; }
.card-address { font-size: 22rpx; color: #666; margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-arrow { color: #555; font-size: 24rpx; margin-left: 8rpx; }

.empty-drawer { text-align: center; padding: 40rpx 0; color: #666; font-size: 26rpx; }
.empty-hint { display: block; margin-top: 8rpx; font-size: 22rpx; color: #555; }
```

- [ ] **Step 6: 提交**

```bash
git add miniprogram/pages/home/ && git commit -m "feat: create map home page with drawer and floating add button"
```

---

### Task 4: 详情/编辑页 (pages/detail) — 双模式复用

**Files:**
- Create: `miniprogram/pages/detail/detail.json`
- Create: `miniprogram/pages/detail/detail.js`
- Create: `miniprogram/pages/detail/detail.wxml`
- Create: `miniprogram/pages/detail/detail.wxss`

- [ ] **Step 1: 输出 HTML 预览确认详情页布局**

预览包含：查看模式（图片 + 信息 + 传送按钮）、编辑模式（表单 + 地图选点 + 图片上传）、模式切换动画。

- [ ] **Step 2: 创建 detail.json**

```json
{
  "usingComponents": {},
  "navigationBarTitleText": "传送点"
}
```

- [ ] **Step 3: 创建 detail.js**

```javascript
const app = getApp();

Page({
  data: {
    mode: "view", // "view" | "edit" | "add"
    waypointId: null,
    waypoint: {},
    form: {
      name: "", category: "", latitude: null, longitude: null,
      address: "", phone: "", notes: "", tags: [], rating: 0, images: [],
    },
    categories: [],
    presetTags: ["好吃", "推荐", "回头客", "环境好", "性价比高", "难找", "需排队", "外卖可", "深夜档"],
    customTag: "",
    submitting: false,
    isOwner: false,
  },

  onLoad(options) {
    const { id, mode } = options;
    this.setData({ mode: mode || "view", waypointId: id || null });
    this.loadCategories();

    if (id) {
      this.loadDetail();
    } else if (mode === "add") {
      this.setData({ mode: "add" });
      this.getCurrentLocation();
    }
  },

  getCurrentLocation() {
    wx.getLocation({
      type: "gcj02",
      success: (res) => {
        this.setData({
          "form.latitude": res.latitude,
          "form.longitude": res.longitude,
        });
      },
    });
  },

  loadCategories() {
    app.callFunction("waypointFunctions", { action: "getPresetCategories" }).then((res) => {
      if (res.result.success) this.setData({ categories: res.result.data });
    });
  },

  loadDetail() {
    app.callFunction("waypointFunctions", {
      action: "getWaypointDetail",
      waypointId: this.data.waypointId,
    }).then((res) => {
      if (res.result.success) {
        const wp = res.result.data;
        const loc = wp.location;
        this.setData({
          waypoint: wp,
          isOwner: wp._openid === undefined, // 云函数返回时 openid 是 _openid
          form: {
            name: wp.name,
            category: wp.category,
            latitude: loc.latitude || loc.coordinates[1],
            longitude: loc.longitude || loc.coordinates[0],
            address: wp.address,
            notes: wp.notes,
            tags: wp.tags || [],
            rating: wp.rating || 0,
            images: wp.images || [],
          },
        });
      }
    });
  },

  // 切换到编辑模式
  onEdit() { this.setData({ mode: "edit" }); },
  onCancel() {
    if (this.data.mode === "add") {
      wx.navigateBack();
    } else {
      this.setData({ mode: "view" });
      this.loadDetail();
    }
  },

  // 表单字段
  onFormField(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  // 分类选择
  onCategorySelect(e) {
    this.setData({ "form.category": e.currentTarget.dataset.category });
  },

  // 标签切换
  onTagToggle(e) {
    const tag = e.currentTarget.dataset.tag;
    const tags = [...this.data.form.tags];
    const idx = tags.indexOf(tag);
    idx > -1 ? tags.splice(idx, 1) : tags.push(tag);
    this.setData({ "form.tags": tags });
  },

  // 自定义标签
  onCustomTagInput(e) { this.setData({ customTag: e.detail.value }); },
  onAddCustomTag() {
    const t = this.data.customTag.trim();
    if (!t || this.data.form.tags.includes(t)) return;
    this.setData({ "form.tags": [...this.data.form.tags, t], customTag: "" });
  },

  // 地图选点
  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          "form.address": res.address || res.name,
          "form.latitude": res.latitude,
          "form.longitude": res.longitude,
        });
      },
    });
  },

  // 图片上传
  onChooseImage() {
    const remain = 6 - this.data.form.images.length;
    if (remain <= 0) return;
    wx.chooseMedia({
      count: remain, mediaType: ["image"], sizeType: ["compressed"],
      success: (res) => {
        wx.showLoading({ title: "上传中..." });
        const uploads = res.tempFiles.map((file) =>
          wx.cloud.uploadFile({
            cloudPath: `waypoint-images/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`,
            filePath: file.tempFilePath,
          })
        );
        Promise.all(uploads).then((results) => {
          wx.hideLoading();
          this.setData({ "form.images": [...this.data.form.images, ...results.map((r) => r.fileID)] });
        });
      },
    });
  },
  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index;
    const images = [...this.data.form.images];
    images.splice(idx, 1);
    this.setData({ "form.images": images });
  },

  // 评分
  onRatingTap(e) {
    this.setData({ "form.rating": e.currentTarget.dataset.rating });
  },

  // 提交
  onSubmit() {
    const { form, submitting, mode, waypointId } = this.data;
    if (submitting) return;
    if (!form.name.trim()) { wx.showToast({ title: "请输入名称", icon: "none" }); return; }
    if (!form.category) { wx.showToast({ title: "请选择分类", icon: "none" }); return; }

    this.setData({ submitting: true });
    const action = mode === "add" ? "addWaypoint" : "updateWaypoint";
    const params = { action, ...form };
    if (mode === "edit") params.waypointId = waypointId;

    app.callFunction("waypointFunctions", params).then((res) => {
      this.setData({ submitting: false });
      if (res.result.success) {
        wx.showToast({ title: mode === "add" ? "传送点已激活" : "已更新", icon: "success" });
        if (mode === "add") wx.switchTab({ url: "/pages/home/home" });
        else { this.setData({ mode: "view" }); this.loadDetail(); }
      } else {
        wx.showToast({ title: res.result.errMsg || "操作失败", icon: "none" });
      }
    });
  },

  // 删除
  onDelete() {
    wx.showModal({
      title: "确认删除",
      content: "删除后无法恢复，确定要移除这个传送点吗？",
      success: (res) => {
        if (res.confirm) {
          app.callFunction("waypointFunctions", {
            action: "deleteWaypoint",
            waypointId: this.data.waypointId,
          }).then((res) => {
            if (res.result.success) {
              wx.showToast({ title: "已删除", icon: "success" });
              wx.switchTab({ url: "/pages/home/home" });
            }
          });
        }
      },
    });
  },

  // 导航
  onNavigate() {
    const { waypoint } = this.data;
    const loc = waypoint.location;
    wx.openLocation({
      name: waypoint.name,
      address: waypoint.address,
      latitude: loc.latitude || loc.coordinates[1],
      longitude: loc.longitude || loc.coordinates[0],
      scale: 16,
    });
  },
});
```

- [ ] **Step 4: 创建 detail.wxml**

```xml
<view class="page">
  <!-- 查看模式 -->
  <block wx:if="{{mode === 'view'}}">
    <swiper class="image-swiper" wx:if="{{waypoint.images && waypoint.images.length > 0}}">
      <swiper-item wx:for="{{waypoint.images}}" wx:key="*this">
        <image class="swiper-img" src="{{item}}" mode="aspectFill" />
      </swiper-item>
    </swiper>
    <view class="detail-header {{waypoint.images && waypoint.images.length > 0 ? '' : 'no-image'}}">
      <text class="detail-name">{{waypoint.name}}</text>
      <view class="detail-meta">
        <text class="detail-category">{{waypoint.category}}</text>
        <text class="detail-rating" wx:if="{{waypoint.rating > 0}}">{{'⭐'.repeat(waypoint.rating)}}</text>
      </view>
    </view>

    <view class="info-section">
      <view class="info-row" wx:if="{{waypoint.address}}">
        <text class="info-label">📍 地址</text>
        <text class="info-value">{{waypoint.address}}</text>
      </view>
      <view class="info-row" wx:if="{{waypoint.notes}}">
        <text class="info-label">📝 备注</text>
        <text class="info-value">{{waypoint.notes}}</text>
      </view>
      <view class="info-row" wx:if="{{waypoint.tags && waypoint.tags.length > 0}}">
        <text class="info-label">🏷️ 标签</text>
        <view class="tag-list">
          <text class="tag" wx:for="{{waypoint.tags}}" wx:key="*this">{{item}}</text>
        </view>
      </view>
    </view>

    <!-- 操作按钮 -->
    <view class="action-bar">
      <button class="nav-btn" bindtap="onNavigate">⚡ 开始传送</button>
      <button class="edit-btn" bindtap="onEdit">✏️</button>
    </view>
  </block>

  <!-- 编辑/新增模式 -->
  <block wx:if="{{mode === 'edit' || mode === 'add'}}">
    <scroll-view class="form-scroll" scroll-y>
      <view class="form-section">
        <view class="section-title">{{mode === 'add' ? '激活新传送点' : '编辑传送点'}}</view>

        <view class="form-item required">
          <text class="form-label">名称</text>
          <input class="form-input" placeholder="传送点名称" value="{{form.name}}" bindinput="onFormField" data-field="name" />
        </view>

        <view class="form-item required">
          <text class="form-label">分类</text>
          <view class="chip-grid">
            <view class="chip {{form.category === item ? 'selected' : ''}}"
              wx:for="{{categories}}" wx:key="*this" bindtap="onCategorySelect" data-category="{{item}}">{{item}}</view>
          </view>
        </view>

        <view class="form-item">
          <text class="form-label">位置</text>
          <view class="location-picker" bindtap="onChooseLocation">
            <text wx:if="{{form.address}}">📍 {{form.address}}</text>
            <text wx:else class="placeholder">点击打开地图选点</text>
          </view>
        </view>

        <view class="form-item">
          <text class="form-label">评分</text>
          <view class="star-row">
            <text class="star {{index < form.rating ? 'active' : ''}}" wx:for="{{[1,2,3,4,5]}}" wx:key="*this" bindtap="onRatingTap" data-rating="{{item}}">★</text>
          </view>
        </view>

        <view class="form-item">
          <text class="form-label">标签</text>
          <view class="chip-grid">
            <view class="chip {{form.tags.indexOf(item) > -1 ? 'selected' : ''}}"
              wx:for="{{presetTags}}" wx:key="*this" bindtap="onTagToggle" data-tag="{{item}}">{{item}}</view>
          </view>
          <view class="custom-tag-row">
            <input class="custom-tag-input" placeholder="自定义标签..." value="{{customTag}}" bindinput="onCustomTagInput" />
            <view class="custom-tag-btn" bindtap="onAddCustomTag">+</view>
          </view>
        </view>

        <view class="form-item">
          <text class="form-label">图片</text>
          <view class="image-grid">
            <view class="image-item" wx:for="{{form.images}}" wx:key="*this">
              <image class="upload-img" src="{{item}}" mode="aspectFill" />
              <view class="image-remove" bindtap="onRemoveImage" data-index="{{index}}">✕</view>
            </view>
            <view class="image-add" wx:if="{{form.images.length < 6}}" bindtap="onChooseImage">
              <text>+</text>
            </view>
          </view>
        </view>

        <view class="form-item">
          <text class="form-label">备注</text>
          <textarea class="form-textarea" placeholder="写点什么..." value="{{form.notes}}" bindinput="onFormField" data-field="notes" />
        </view>
      </view>
    </scroll-view>

    <!-- 底部操作栏 -->
    <view class="form-actions">
      <button class="cancel-btn" bindtap="onCancel">取消</button>
      <button class="submit-btn" bindtap="onSubmit" disabled="{{submitting}}">{{submitting ? '保存中...' : (mode === 'add' ? '激活传送点' : '保存修改')}}</button>
      <button class="delete-btn" wx:if="{{mode === 'edit'}}" bindtap="onDelete">🗑️</button>
    </view>
  </block>
</view>
```

- [ ] **Step 5: 创建 detail.wxss**

```css
.page { min-height: 100vh; background: #0F0F23; padding-bottom: 120rpx; }

/* 图片轮播 */
.image-swiper { width: 100%; height: 480rpx; }
.swiper-img { width: 100%; height: 100%; }

/* 详情头部 */
.detail-header { padding: 32rpx 24rpx 16rpx; }
.detail-header.no-image { padding-top: 40rpx; }
.detail-name { font-size: 40rpx; font-weight: 700; color: #FFFFFF; }
.detail-meta { display: flex; gap: 16rpx; margin-top: 12rpx; align-items: center; }
.detail-category { font-size: 26rpx; color: #00D4FF; background: rgba(0,212,255,0.1); padding: 6rpx 16rpx; border-radius: 6rpx; }
.detail-rating { font-size: 28rpx; color: #FFD700; }

/* 信息区 */
.info-section { margin: 16rpx 24rpx; background: rgba(255,255,255,0.04); border-radius: 16rpx; padding: 24rpx; border: 1rpx solid rgba(255,255,255,0.06); }
.info-row { display: flex; padding: 16rpx 0; border-bottom: 1rpx solid rgba(255,255,255,0.06); }
.info-row:last-child { border-bottom: none; }
.info-label { width: 140rpx; font-size: 26rpx; color: #888; flex-shrink: 0; }
.info-value { flex: 1; font-size: 28rpx; color: #E0E0E0; }
.tag-list { display: flex; flex-wrap: wrap; gap: 8rpx; }
.tag { padding: 4rpx 14rpx; background: rgba(0,212,255,0.1); color: #00D4FF; border-radius: 4rpx; font-size: 22rpx; }

/* 操作按钮 */
.action-bar { display: flex; margin: 24rpx; gap: 16rpx; }
.nav-btn { flex: 1; height: 88rpx; background: linear-gradient(135deg, #00D4FF, #0099CC); color: #FFFFFF; border-radius: 16rpx; font-size: 32rpx; font-weight: 600; display: flex; align-items: center; justify-content: center; border: none; }
.edit-btn { width: 88rpx; height: 88rpx; background: rgba(255,255,255,0.08); color: #888; border-radius: 16rpx; font-size: 32rpx; display: flex; align-items: center; justify-content: center; border: 1rpx solid rgba(255,255,255,0.1); }

/* 表单 */
.form-scroll { flex: 1; }
.form-section { padding: 24rpx; }
.section-title { font-size: 34rpx; font-weight: 700; color: #FFFFFF; margin-bottom: 24rpx; }
.form-item { margin-bottom: 28rpx; }
.form-item.required .form-label::after { content: " *"; color: #FF4444; }
.form-label { font-size: 26rpx; color: #888; display: block; margin-bottom: 12rpx; }
.form-input { height: 80rpx; background: rgba(255,255,255,0.06); border: 1rpx solid rgba(255,255,255,0.1); border-radius: 12rpx; padding: 0 24rpx; font-size: 28rpx; color: #FFFFFF; box-sizing: border-box; }
.form-textarea { width: 100%; height: 180rpx; background: rgba(255,255,255,0.06); border: 1rpx solid rgba(255,255,255,0.1); border-radius: 12rpx; padding: 20rpx; font-size: 28rpx; color: #FFFFFF; box-sizing: border-box; }

/* 分类芯片 */
.chip-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.chip { padding: 10rpx 24rpx; background: rgba(255,255,255,0.06); border: 1rpx solid rgba(255,255,255,0.1); border-radius: 12rpx; font-size: 26rpx; color: #888; }
.chip.selected { background: rgba(0,212,255,0.15); border-color: rgba(0,212,255,0.3); color: #00D4FF; font-weight: 600; }

/* 位置选择 */
.location-picker { min-height: 80rpx; background: rgba(255,255,255,0.06); border: 1rpx solid rgba(255,255,255,0.1); border-radius: 12rpx; padding: 20rpx 24rpx; font-size: 26rpx; color: #E0E0E0; display: flex; align-items: center; }
.placeholder { color: #555; }

/* 评分星星 */
.star-row { display: flex; gap: 8rpx; }
.star { font-size: 48rpx; color: rgba(255,255,255,0.15); }
.star.active { color: #FFD700; }

/* 自定义标签 */
.custom-tag-row { display: flex; gap: 12rpx; margin-top: 12rpx; }
.custom-tag-input { flex: 1; height: 64rpx; background: rgba(255,255,255,0.06); border: 1rpx solid rgba(255,255,255,0.1); border-radius: 12rpx; padding: 0 20rpx; font-size: 26rpx; color: #FFFFFF; }
.custom-tag-btn { width: 64rpx; height: 64rpx; background: rgba(0,212,255,0.15); border: 1rpx solid rgba(0,212,255,0.3); border-radius: 12rpx; color: #00D4FF; display: flex; align-items: center; justify-content: center; font-size: 32rpx; }

/* 图片上传 */
.image-grid { display: flex; flex-wrap: wrap; gap: 16rpx; }
.image-item { position: relative; width: 200rpx; height: 200rpx; }
.upload-img { width: 100%; height: 100%; border-radius: 12rpx; }
.image-remove { position: absolute; top: -8rpx; right: -8rpx; width: 40rpx; height: 40rpx; background: rgba(255,0,0,0.7); color: #FFFFFF; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28rpx; }
.image-add { width: 200rpx; height: 200rpx; background: rgba(255,255,255,0.06); border: 1rpx dashed rgba(255,255,255,0.2); border-radius: 12rpx; display: flex; align-items: center; justify-content: center; font-size: 56rpx; color: #555; }

/* 底部操作栏 */
.form-actions { position: fixed; bottom: 0; left: 0; right: 0; padding: 16rpx 24rpx 40rpx; background: rgba(15,15,35,0.98); display: flex; gap: 16rpx; z-index: 10; }
.cancel-btn { padding: 0 28rpx; height: 88rpx; background: rgba(255,255,255,0.06); color: #888; border-radius: 16rpx; font-size: 28rpx; display: flex; align-items: center; border: 1rpx solid rgba(255,255,255,0.1); }
.submit-btn { flex: 1; height: 88rpx; background: linear-gradient(135deg, #00D4FF, #0099CC); color: #FFFFFF; border-radius: 16rpx; font-size: 28rpx; font-weight: 600; display: flex; align-items: center; justify-content: center; border: none; }
.submit-btn[disabled] { opacity: 0.5; }
.delete-btn { width: 88rpx; height: 88rpx; background: rgba(255,0,0,0.1); border: 1rpx solid rgba(255,0,0,0.3); border-radius: 16rpx; font-size: 32rpx; display: flex; align-items: center; justify-content: center; }
```

- [ ] **Step 6: 提交**

```bash
git add miniprogram/pages/detail/ && git commit -m "feat: create detail page with view/edit dual mode"
```

---

### Task 5: 我的页面 (pages/mine) — 统计 + 列表 + 设置

**Files:**
- Create: `miniprogram/pages/mine/mine.json`
- Create: `miniprogram/pages/mine/mine.js`
- Create: `miniprogram/pages/mine/mine.wxml`
- Create: `miniprogram/pages/mine/mine.wxss`

- [ ] **Step 1: 输出 HTML 预览确认我的页面布局**

预览包含：顶部统计面板（总数+分类分布）、Marker 风格切换开关、传送点列表（可筛选）。

- [ ] **Step 2: 创建 mine.json**

```json
{
  "usingComponents": {},
  "navigationBarTitleText": "我的"
}
```

- [ ] **Step 3: 创建 mine.js**

```javascript
const app = getApp();

Page({
  data: {
    stats: { total: 0, categories: {} },
    waypoints: [],
    activeCategory: "",
    markerStyle: "game",
    loading: true,
  },

  onShow() {
    this.setData({ markerStyle: app.globalData.markerStyle || "game" });
    this.loadStats();
    this.loadWaypoints();
  },

  loadStats() {
    app.callFunction("waypointFunctions", { action: "getMyStats" }).then((res) => {
      if (res.result.success) this.setData({ stats: res.result.data });
    });
  },

  loadWaypoints() {
    app.callFunction("waypointFunctions", {
      action: "getMyWaypoints",
      category: this.data.activeCategory,
    }).then((res) => {
      this.setData({ waypoints: res.result.success ? res.result.data : [], loading: false });
    });
  },

  onCategoryFilter(e) {
    const cat = e.currentTarget.dataset.category;
    this.setData({ activeCategory: this.data.activeCategory === cat ? "" : cat });
    this.loadWaypoints();
  },

  onWaypointTap(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` });
  },

  onMarkerStyleChange(e) {
    const style = e.currentTarget.dataset.style;
    this.setData({ markerStyle: style });
    app.globalData.markerStyle = style;
    wx.setStorageSync("markerStyle", style);
    wx.showToast({ title: "已切换", icon: "none" });
  },
});
```

- [ ] **Step 4: 创建 mine.wxml**

```xml
<view class="page">
  <!-- 头部统计 -->
  <view class="stats-header">
    <view class="stats-total">
      <text class="stats-number">{{stats.total}}</text>
      <text class="stats-label">传送点</text>
    </view>
    <view class="stats-breakdown">
      <view class="stats-item" wx:for="{{stats.categories}}" wx:for-index="cat" wx:for-item="count" wx:key="cat">
        <text class="stats-count">{{count}}</text>
        <text class="stats-cat">{{cat}}</text>
      </view>
    </view>
  </view>

  <!-- Marker 风格切换 -->
  <view class="settings-section">
    <text class="section-title">Marker 风格</text>
    <view class="style-options">
      <view class="style-opt {{markerStyle === 'game' ? 'active' : ''}}" bindtap="onMarkerStyleChange" data-style="game">
        <text class="style-icon">💎</text>
        <text>游戏风</text>
      </view>
      <view class="style-opt {{markerStyle === 'minimal' ? 'active' : ''}}" bindtap="onMarkerStyleChange" data-style="minimal">
        <text class="style-icon">📌</text>
        <text>简约</text>
      </view>
      <view class="style-opt {{markerStyle === 'numbered' ? 'active' : ''}}" bindtap="onMarkerStyleChange" data-style="numbered">
        <text class="style-icon">🔢</text>
        <text>编号</text>
      </view>
    </view>
  </view>

  <!-- 分类筛选 -->
  <scroll-view class="filter-row" scroll-x>
    <view class="filter-item {{activeCategory === '' ? 'active' : ''}}" bindtap="onCategoryFilter" data-category="">全部</view>
    <view class="filter-item {{activeCategory === cat ? 'active' : ''}}"
      wx:for="{{stats.categories}}" wx:for-index="cat" wx:for-item="count" wx:key="cat"
      bindtap="onCategoryFilter" data-category="{{cat}}">{{cat}} ({{count}})</view>
  </scroll-view>

  <!-- 列表 -->
  <scroll-view class="list" scroll-y>
    <view class="waypoint-card" wx:for="{{waypoints}}" wx:key="_id" bindtap="onWaypointTap" data-id="{{item._id}}">
      <image class="card-thumb" src="{{item.images[0] || '/images/default-goods-image.png'}}" mode="aspectFill" />
      <view class="card-body">
        <text class="card-name">{{item.name}}</text>
        <view class="card-meta">
          <text class="card-category">{{item.category}}</text>
          <text class="card-rating" wx:if="{{item.rating > 0}}">⭐{{item.rating}}</text>
        </view>
      </view>
      <text class="card-arrow">▶</text>
    </view>
    <view class="empty" wx:if="{{!loading && waypoints.length === 0}}">
      <text>暂无传送点</text>
    </view>
  </scroll-view>
</view>
```

- [ ] **Step 5: 创建 mine.wxss**

```css
.page { min-height: 100vh; background: #0F0F23; padding-bottom: 40rpx; }

/* 统计头部 */
.stats-header {
  background: linear-gradient(180deg, rgba(0,212,255,0.1), transparent);
  padding: 40rpx 24rpx 32rpx; display: flex; align-items: center; gap: 32rpx;
}
.stats-total { text-align: center; flex-shrink: 0; }
.stats-number { font-size: 72rpx; font-weight: 800; color: #00D4FF; display: block; line-height: 1; }
.stats-label { font-size: 24rpx; color: #888; margin-top: 8rpx; display: block; }
.stats-breakdown { display: flex; flex-wrap: wrap; gap: 16rpx; }
.stats-item { text-align: center; }
.stats-count { font-size: 36rpx; font-weight: 700; color: #FFFFFF; display: block; }
.stats-cat { font-size: 20rpx; color: #888; display: block; }

/* 设置区 */
.settings-section { margin: 0 24rpx 24rpx; background: rgba(255,255,255,0.04); border-radius: 16rpx; padding: 24rpx; border: 1rpx solid rgba(255,255,255,0.06); }
.section-title { font-size: 28rpx; font-weight: 600; color: #FFFFFF; margin-bottom: 16rpx; }
.style-options { display: flex; gap: 12rpx; }
.style-opt {
  flex: 1; text-align: center; padding: 16rpx 0; background: rgba(255,255,255,0.04);
  border: 1rpx solid rgba(255,255,255,0.08); border-radius: 12rpx; color: #888; font-size: 24rpx;
}
.style-opt.active { background: rgba(0,212,255,0.1); border-color: rgba(0,212,255,0.3); color: #00D4FF; }
.style-icon { display: block; font-size: 32rpx; margin-bottom: 4rpx; }

/* 分类筛选行 */
.filter-row { display: flex; white-space: nowrap; padding: 8rpx 24rpx 16rpx; }
.filter-item {
  display: inline-flex; padding: 8rpx 24rpx; margin-right: 12rpx;
  background: rgba(255,255,255,0.06); border-radius: 28rpx;
  font-size: 24rpx; color: #888; flex-shrink: 0;
}
.filter-item.active { background: rgba(0,212,255,0.15); color: #00D4FF; font-weight: 600; }

/* 列表 */
.list { padding: 0 24rpx; }
.waypoint-card {
  display: flex; align-items: center; padding: 16rpx; margin-bottom: 12rpx;
  background: rgba(255,255,255,0.04); border-radius: 12rpx;
  border: 1rpx solid rgba(255,255,255,0.06);
}
.card-thumb { width: 100rpx; height: 100rpx; border-radius: 10rpx; flex-shrink: 0; background: rgba(255,255,255,0.1); }
.card-body { flex: 1; margin-left: 16rpx; }
.card-name { font-size: 28rpx; font-weight: 600; color: #FFFFFF; }
.card-meta { display: flex; gap: 12rpx; margin-top: 4rpx; }
.card-category { font-size: 22rpx; color: #00D4FF; background: rgba(0,212,255,0.1); padding: 2rpx 10rpx; border-radius: 4rpx; }
.card-rating { font-size: 22rpx; color: #FFD700; }
.card-arrow { color: #555; font-size: 24rpx; margin-left: 8rpx; }

.empty { text-align: center; padding: 80rpx 0; color: #666; font-size: 26rpx; }
```

- [ ] **Step 6: 提交**

```bash
git add miniprogram/pages/mine/ && git commit -m "feat: create mine page with stats, marker style switch, and list"
```

---

## 验证步骤

1. 在微信开发者工具中打开项目，确认 CloudBase 环境已创建
2. 填入环境 ID 到 `app.js`
3. 部署 `waypointFunctions` 云函数
4. 在模拟器中：点击 + 按钮 → 地图选点 → 填写 → 激活传送点
5. 验证 Marker 出现在地图首页
6. 验证底部抽屉列表显示
7. 验证点击 Marker/卡片进入详情
8. 验证「开始传送」调用 `wx.openLocation`
9. 验证「我的」页面统计和列表正确
10. 验证 Marker 风格切换生效
