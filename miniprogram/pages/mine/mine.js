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
    const db = app.getDb();
    if (!db) return;
    db.collection('waypoints').get().then((res) => {
      const data = res.data || [];
      const catCount = {};
      data.forEach(wp => { catCount[wp.category] = (catCount[wp.category] || 0) + 1; });
      this.setData({ stats: { total: data.length, categories: catCount } });
    }).catch(() => {});
  },

  loadWaypoints() {
    this.setData({ loading: true });
    const db = app.getDb();
    if (!db) { this.setData({ loading: false }); return; }
    let query = db.collection('waypoints').orderBy('create_time', 'desc').limit(50);
    if (this.data.activeCategory) query = query.where({ category: this.data.activeCategory });
    query.get().then((res) => {
      this.setData({ waypoints: res.data || [], loading: false });
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
