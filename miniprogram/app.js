// app.js
App({
  onLaunch: function () {
    const envId = "";
    this.globalData = {
      env: envId,
      isCloudReady: false,
      markerStyle: "game",
      theme: "dark",
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
