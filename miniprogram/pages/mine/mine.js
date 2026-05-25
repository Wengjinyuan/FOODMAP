const app = getApp();

Page({
  data: {
    stats: { total: 0, categories: {} },
    waypoints: [],
    activeCategory: '',
    markerStyle: 'game',
    loading: true,
  },

  onLoad() {
    // 从存储恢复 markerStyle
    const saved = wx.getStorageSync('markerStyle');
    if (saved) {
      this.setData({ markerStyle: saved });
      app.globalData.markerStyle = saved;
    }
  },

  onShow() {
    this.setData({ markerStyle: app.globalData.markerStyle || wx.getStorageSync('markerStyle') || 'game' });
    this.loadStats();
    this.loadWaypoints();
  },

  loadStats() {
    const call = app.callFunction('waypointFunctions', { action: 'getMyStats' });
    const timeout = new Promise((r) => setTimeout(() => r(null), 5000));
    Promise.race([call, timeout]).then((res) => {
      if (res && res.result && res.result.success) {
        this.setData({ stats: res.result.data });
      }
    }).catch(() => {});
  },

  loadWaypoints() {
    this.setData({ loading: true });
    const call = app.callFunction('waypointFunctions', { action: 'getMyWaypoints', category: this.data.activeCategory });
    const timeout = new Promise((r) => setTimeout(() => r(null), 5000));
    Promise.race([call, timeout]).then((res) => {
      if (res && res.result && res.result.success) {
        this.setData({ waypoints: res.result.data, loading: false });
      } else {
        this.setData({ waypoints: [], loading: false });
      }
    }).catch(() => {
      this.setData({ waypoints: [], loading: false });
    });
  },

  onCategoryFilter(e) {
    const cat = e.currentTarget.dataset.category;
    this.setData({ activeCategory: this.data.activeCategory === cat ? '' : cat });
    this.loadWaypoints();
  },

  onWaypointTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  onMarkerStyleChange(e) {
    const style = e.currentTarget.dataset.style;
    this.setData({ markerStyle: style });
    app.globalData.markerStyle = style;
    wx.setStorageSync('markerStyle', style);
    wx.showToast({ title: 'Marker 风格已切换', icon: 'none' });
  },
});
