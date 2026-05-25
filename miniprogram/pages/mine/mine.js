const app = getApp();

Page({
  data: {
    stats: { total: 0, categories: {} },
    waypoints: [],
    activeCategory: '',
    loading: true,
  },

  onShow() {
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
});
