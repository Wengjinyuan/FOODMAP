const app = getApp();

Page({
  data: {
    stats: { total: 0, categories: {} },
    waypoints: [],
    activeCategory: '',
    markerStyle: 'game',
    loading: true,
  },

  onShow() {
    this.setData({ markerStyle: app.globalData.markerStyle || 'game' });
    this.loadStats();
    this.loadWaypoints();
  },

  loadStats() {
    app.callFunction('waypointFunctions', { action: 'getMyStats' }).then((res) => {
      if (res.result && res.result.success) {
        this.setData({ stats: res.result.data });
      }
    });
  },

  loadWaypoints() {
    this.setData({ loading: true });
    app.callFunction('waypointFunctions', {
      action: 'getMyWaypoints',
      category: this.data.activeCategory,
    }).then((res) => {
      if (res.result && res.result.success) {
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
