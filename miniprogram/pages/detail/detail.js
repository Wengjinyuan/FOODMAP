const app = getApp();

Page({
  data: {
    navTop: 0,
    mode: 'view',
    waypointId: null,
    waypoint: {},
    form: {
      name: '', categories: [], categorySelectedMap: {}, latitude: null, longitude: null,
      address: '', notes: '', tags: [], tagSelectedMap: {}, rating: 0, images: [],
    },
    categories: [],
    customCategory: '',
    presetTags: ['好吃', '推荐', '回头客', '环境好', '性价比高', '难找', '深夜档'],
    userTags: [],
    showUserTags: false,
    customTag: '',
    submitting: false,
    isOwner: false,
    detailMapMarkers: [],
  },

  onLoad(options) {
    const capsule = wx.getMenuButtonBoundingClientRect();
    const { windowWidth } = wx.getWindowInfo();
    const scale = 750 / windowWidth;
    this.setData({ navTop: (capsule.bottom + 8) * scale });

    const { id, mode } = options;
    this.loadCategories();
    if (mode === 'add') {
      this.setData({ mode: 'add' });
      this.getCurrentLocation();
    } else if (id) {
      this.setData({ waypointId: id, mode: 'view' });
      this.loadDetail();
    }
  },

  getCurrentLocation() {
    wx.getLocation({ type: 'gcj02', success: (res) => {
      this.setData({ 'form.latitude': res.latitude, 'form.longitude': res.longitude });
    }});
  },

  // ── Categories ──
  loadCategories() {
    // 基础兜底
    const base = ['美食', '咖啡', '风景', '根据地', '购物', '娱乐', '其他'];
    this.setData({ categories: base });
    // 合并存储的自定义分类
    const storedCats = wx.getStorageSync('customCategories') || [];
    const catSet = new Set([...base, ...storedCats]);
    // 从数据库加载用户分类和标签
    const db = app.getDb();
    if (!db) return this.setData({ categories: [...catSet].sort((a, b) => (a === '其他' ? 1 : b === '其他' ? -1 : 0)) });
    db.collection('waypoints').field({ categories: true, category: true, tags: true }).limit(500).get().then((res) => {
      const tagSet = new Set();
      (res.data || []).forEach(w => {
        const cats = w.categories || (w.category ? [w.category] : []);
        cats.forEach(c => catSet.add(c));
        if (w.tags) w.tags.forEach(t => tagSet.add(t));
      });
      const storedTags = wx.getStorageSync('customTags') || [];
      storedTags.forEach(t => tagSet.add(t));
      const userTags = [...tagSet].filter(t => !this.data.presetTags.includes(t));
      this.setData({ categories: [...catSet].sort((a, b) => (a === '其他' ? 1 : b === '其他' ? -1 : 0)), userTags });
    }).catch(() => { this.setData({ categories: [...catSet].sort((a, b) => (a === '其他' ? 1 : b === '其他' ? -1 : 0)) }); });
  },

  loadDetail() {
    const db = app.getDb();
    if (!db) return;
    db.collection('waypoints').doc(this.data.waypointId).get().then((res) => {
      const wp = res.data;
      if (!wp) return;
      const loc = wp.location || {};
      const lat = loc.latitude || (loc.coordinates && loc.coordinates[1]) || 0;
      const lng = loc.longitude || (loc.coordinates && loc.coordinates[0]) || 0;
      wp.ratingRounded = Math.round(wp.rating || 0);
      wp.ratingStars = wp.rating > 0 ? '⭐'.repeat(wp.ratingRounded) : '';
      const cats = wp.categories || (wp.category ? [wp.category] : []);
      const cmap = {}; cats.forEach(c => cmap[c] = true);
      const tags = wp.tags || [];
      const tmap = {}; tags.forEach(t => tmap[t] = true);
      this.setData({
        waypoint: wp, isOwner: true,
        detailMapMarkers: [{ id: 1, latitude: lat, longitude: lng, iconPath: '', width: 1, height: 1,
          label: { content: wp.name, color: '#4A3A35', fontSize: 14, bgColor: '#FFFDF7', borderRadius: 8, padding: 6, display: 'ALWAYS' }
        }],
        form: {
          name: wp.name, categories: cats, categorySelectedMap: cmap,
          latitude: lat || null, longitude: lng || null,
          address: wp.address || '', notes: wp.notes || '',
          tags: tags, tagSelectedMap: tmap, rating: wp.rating || 0, images: wp.images || [],
        },
      });
      wx.setNavigationBarTitle({ title: wp.name || '传送点' });
    });
  },

  onBackToHome() { wx.switchTab({ url: '/pages/home/home' }); },
  onEdit() { this.setData({ mode: 'edit' }); },
  onCancel() {
    if (this.data.mode === 'add') wx.navigateBack();
    else { this.setData({ mode: 'view' }); this.loadDetail(); }
  },

  // ── Form ──
  onFormField(e) { this.setData({ ['form.' + e.currentTarget.dataset.field]: e.detail.value }); },

  // Category chip toggle（多选）
  onCategorySelect(e) {
    const cat = e.currentTarget.dataset.category;
    const cats = [...this.data.form.categories];
    const idx = cats.indexOf(cat);
    if (idx > -1) cats.splice(idx, 1); else cats.push(cat);
    const map = {}; cats.forEach(c => map[c] = true);
    this.setData({ 'form.categories': cats, 'form.categorySelectedMap': map });
  },
  onCustomCategoryInput(e) { this.setData({ customCategory: e.detail.value }); },
  onToggleUserTags() {
    this.setData({ showUserTags: !this.data.showUserTags });
  },
  onAddCustomCategory() {
    const c = this.data.customCategory.trim();
    if (!c) return;
    const cats = [...this.data.form.categories];
    if (!cats.includes(c)) cats.push(c);
    const map = {}; cats.forEach(x => map[x] = true);
    this.setData({ 'form.categories': cats, 'form.categorySelectedMap': map, customCategory: '' });
    if (!this.data.categories.includes(c)) {
      this.setData({ categories: [...this.data.categories, c] });
    }
    // 同步到 storage，跨页面可用
    const stored = wx.getStorageSync('customCategories') || [];
    if (!stored.includes(c)) { stored.push(c); wx.setStorageSync('customCategories', stored); }
  },

  // Category manage
  onManageCategories() {
    const cats = [...this.data.categories];
    if (cats.length <= 1) return wx.showToast({ title: '至少保留1个分类', icon: 'none' });
    wx.showActionSheet({
      itemList: cats,
      success: (res) => {
        const removed = cats.splice(res.tapIndex, 1);
        this.setData({ categories: cats });
        const cats = this.data.form.categories.filter(c => c !== removed[0]);
        this.setData({ 'form.categories': cats });
      },
    });
  },

  _buildTagMap(tags) { const m = {}; (tags||[]).forEach(t => m[t]=true); return m; },

  // Tags
  onRemoveTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const tags = this.data.form.tags.filter(t => t !== tag);
    this.setData({ 'form.tags': tags, 'form.tagSelectedMap': this._buildTagMap(tags) });
  },
  onTagToggle(e) {
    const tag = e.currentTarget.dataset.tag;
    const tags = [...this.data.form.tags];
    const idx = tags.indexOf(tag);
    if (idx > -1) tags.splice(idx, 1);
    else { if (tags.length >= 5) return wx.showToast({ title: '最多5个标签', icon: 'none' }); tags.push(tag); }
    this.setData({ 'form.tags': tags, 'form.tagSelectedMap': this._buildTagMap(tags) });
  },
  onCustomTagInput(e) { this.setData({ customTag: e.detail.value }); },
  onAddCustomTag() {
    const t = this.data.customTag.trim();
    if (!t || this.data.form.tags.includes(t)) return;
    if (this.data.form.tags.length >= 5) return wx.showToast({ title: '最多5个标签', icon: 'none' });
    const tags = [...this.data.form.tags, t];
    this.setData({ 'form.tags': tags, 'form.tagSelectedMap': this._buildTagMap(tags), customTag: '' });
  },

  // Location
  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          'form.address': res.address || res.name,
          'form.latitude': res.latitude,
          'form.longitude': res.longitude,
        });
      },
      fail: () => { wx.showToast({ title: '请在手机端使用地图选点', icon: 'none' }); },
    });
  },

  // Images
  onChooseImage() {
    const remain = 6 - this.data.form.images.length;
    if (remain <= 0) return wx.showToast({ title: '最多6张', icon: 'none' });
    wx.chooseMedia({ count: remain, mediaType: ['image'], sizeType: ['compressed'], success: (res) => {
      wx.showLoading({ title: '上传中...' });
      const uploads = res.tempFiles.map((file) =>
        wx.cloud.uploadFile({ cloudPath: 'waypoint-images/' + Date.now() + '_' + Math.random().toString(36).substr(2,8) + '.jpg', filePath: file.tempFilePath })
      );
      Promise.all(uploads).then((results) => {
        wx.hideLoading();
        this.setData({ 'form.images': [...this.data.form.images, ...results.map(r => r.fileID)] });
      }).catch(() => { wx.hideLoading(); wx.showToast({ title: '上传失败', icon: 'none' }); });
    }});
  },
  onRemoveImage(e) {
    const images = [...this.data.form.images];
    images.splice(e.currentTarget.dataset.index, 1);
    this.setData({ 'form.images': images });
  },

  // Rating
  onRatingTap(e) { this.setData({ 'form.rating': Number(e.currentTarget.dataset.rating) }); },

  // Submit (走云函数绕过安全规则)
  onSubmit() {
    const { form, submitting, mode, waypointId } = this.data;
    if (submitting) return;
    if (!form.name.trim()) return wx.showToast({ title: '请输入名称', icon: 'none' });
    if (!form.categories || form.categories.length === 0) return wx.showToast({ title: '请至少选一个分类', icon: 'none' });
    this.setData({ submitting: true });

    const action = mode === 'add' ? 'addWaypoint' : 'updateWaypoint';
    const payload = {
      action, name: form.name, categories: form.categories,
      latitude: form.latitude, longitude: form.longitude,
      address: form.address, notes: form.notes, tags: form.tags,
      rating: Number(form.rating) || 0, images: form.images,
    };
    if (mode !== 'add') payload.waypointId = waypointId;

    wx.cloud.callFunction({ name: 'waypointFunctions', data: payload }).then(({ result }) => {
      if (!result.success) { this.setData({ submitting: false }); return wx.showToast({ title: result.errMsg || '操作失败', icon: 'none' }); }
      // 同步新分类到 storage
      const BASE = ['美食','咖啡','风景','根据地','购物','娱乐','其他'];
      const stored = wx.getStorageSync('customCategories') || [];
      let chg = false;
      form.categories.forEach(c => { if (!BASE.includes(c) && !stored.includes(c)) { stored.push(c); chg = true; } });
      if (chg) wx.setStorageSync('customCategories', stored);
      this.setData({ submitting: false });
      wx.showToast({ title: mode === 'add' ? '传送点已激活!' : '已更新!', icon: 'success' });
      if (mode === 'add') wx.switchTab({ url: '/pages/home/home' });
      else { this.setData({ mode: 'view' }); this.loadDetail(); }
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  // Delete (走云函数绕过安全规则)
  onDelete() {
    wx.showModal({
      title: '确认删除', content: '删除后无法恢复', confirmColor: '#FF6B6B',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        wx.cloud.callFunction({
          name: 'waypointFunctions',
          data: { action: 'deleteWaypoint', waypointId: this.data.waypointId }
        }).then(({ result }) => {
          wx.hideLoading();
          if (result.success) {
            wx.showToast({ title: '已删除', icon: 'success' });
            wx.switchTab({ url: '/pages/home/home' });
          } else {
            wx.showToast({ title: result.errMsg || '删除失败', icon: 'none' });
          }
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'none' });
        });
      },
    });
  },

  // Image preview
  onPreviewImage(e) {
    const src = e.currentTarget.dataset.src;
    wx.previewImage({ urls: this.data.waypoint.images, current: src });
  },

  // Mini map tap → ask then navigate
  onMapNavigate() {
    wx.showModal({
      title: '开始传送？',
      content: '将打开地图导航到 ' + (this.data.waypoint.name || '此位置'),
      confirmText: '⚡ 传送',
      success: (res) => {
        if (res.confirm) this.onNavigate();
      },
    });
  },

  // Navigate
  onNavigate() {
    const wp = this.data.waypoint;
    const loc = wp.location || {};
    wx.openLocation({
      name: wp.name, address: wp.address,
      latitude: loc.latitude || (loc.coordinates && loc.coordinates[1]) || 0,
      longitude: loc.longitude || (loc.coordinates && loc.coordinates[0]) || 0,
      scale: 16,
    });
  },
});
