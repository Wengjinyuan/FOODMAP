// app.js
App({
  onLaunch: function () {
    const envId = "";
    this.globalData = {
      env: envId,
      isCloudReady: false,
      markerStyle: "game",
      theme: "cute",
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
    if (!this.globalData.isCloudReady) {
      console.warn("云开发未配置，无法使用数据库");
      return null;
    }
    return wx.cloud.database();
  },

  callFunction: function (name, data) {
    if (!this.globalData.isCloudReady) {
      wx.showModal({
        title: '云开发未开通',
        content: '请在微信开发者工具中点击"云开发"按钮开通云开发服务，然后在 app.js 中填入环境 ID。',
        showCancel: false,
      });
      return Promise.reject(new Error('云开发未配置'));
    }
    return wx.cloud.callFunction({ name, data });
  },
});
