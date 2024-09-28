const { CmdService } = require("./cmdService");

class BuildService {
  constructor(core) {
    this.agc = core.agc;
    this.core = core;
    this.dh = core.dh;
    this.cmd = new CmdService()
  }
  running = false;

  agcConfig = {
    clientId: "",
    clientKey: "",
    teamId: "",
    projectId: "",
    appId: "",
    prodCert: {},
    debugCert: {},
  };

  async checkPackageName(packageName) {
    try{
      let result = await this.agc.checkPackageName(packageName);
      if(result.ret.code == 0)
        return true
      else {
        console.log("create result", result)
      }
      return false
    } catch(e) {
      if(e == "401"){
        this.core.openChildWindiow();
      }
      return  false;
    }
  }
  async createPackageName(appName){
    try{
      let userInfo = (await this.agc.userInfo()).body.getDetailInfo;
      let userId = userInfo.userID
      let packageName = `com.${userId}.${appName}`
      console.log("create tpackageName", packageName)
      this.checkPackageName(packageName)
     
      return packageName;
    } catch(e) {
      if(e == "401"){
        this.core.openChildWindiow();
      }
      return  false;
    }
  }

  async checkAccount(commonInfo) {
    
    if (this.running) return;
    this.running = true;
      // 已经登录
      let result = await this.startStep(
        "accountInfo",
        0,
        async (i) => {
          let result = await this.agc.userTeamList();
          let userTeam = result.teams.find((i) => i.userType == 1);
          this.agcConfig.teamId = userTeam.id;
          this.agc.agcteamid = userTeam.id;
          let userInfo = (await this.agc.userInfo()).body.getDetailInfo;
          return {
            value: userTeam.name || userInfo.baseInfo.nickName,
            message: "登录成功",
          };
        },
        "失败"
      );
      if (!result) {
        this.running = false;
        this.core.openChildWindiow();
        return ;
      }

      const appName = commonInfo?.appName || "xiaobai-app";
      const packageName = commonInfo?.packageName || "com.xiaobai.app";

      await this.startStep(
        "accountInfo",
        1,
        async (i) => {
          let projectName = "xiaobai-project";
          let result = await this.agc.projectList(projectName);
          let project = {};
          let projectId = "";
          if (result.projectList.length > 0) {
            project = result.projectList[0];
            projectId = project.projectId;
          } else {
            result = await this.agc.createProject(projectName);
            projectId = result.mapping.projectId;
          }
          this.agcConfig.projectId = projectId;
          result = await this.agc.appList();
          const appList = result.appList || [];
          let app = appList.find((a) => a.packageName == packageName);
          if (!app) {
            let result = await this.agc.createApp(
              appName,
              packageName,
              projectId
            );
            const appId = result.appId;
            await this.agc.orderApp(projectId, appId);
            result = await this.agc.appList();
            app = result.appList.find((a) => a.appId == appId);
            console.debug("new app", app);
          }
          this.agcConfig.appId = app.appId;
          return {
            value: app.appName + `(${app.packageName})`,
            message: "完成",
          };
        },
        "失败"
      );
      // clientApi
      await this.startStep(
        "accountInfo",
        2,
        async (i) => {
          let clientName = "xiaobai-api";
          let result = await this.agc.clientApiList();
          const api = result.clients.find((a) => a.name == clientName);
          if (!api) {
            result = await this.agc.createApi(clientName);
            const clientId = result.clientId;
            result = await this.agc.clientApiList();
            api = result.clients.find((a) => a.clientId == clientId);
          }
          this.agcConfig.clientId = api.clientId;
          this.agcConfig.clientKey = api.secrets[0].name;
          return {
            value: `${api.clientId}(${api.secrets[0].name.substring(0, 8)}...)`,
            message: "完成",
          };
        },
        "失败"
      );
       // debugCert
      await this.startStep(
        "accountInfo",
        3,
        async (i) => {
          let debugName = "xiaobai-debug"
          let debugCert = await this.createAndDownloadCert(debugName, 1)
          this.agcConfig.debugCert = debugCert
          return {
            value: `${debugName}`,
            message: "完成",
          };
        },
        "失败"
      );
      // prodCert
      await this.startStep(
        "accountInfo",
        4,
        async (i) => {
          const pordName = "moonlight-prod";
          let prodCert = await this.createAndDownloadCert(pordName, 2)
          this.agcConfig.prodCert = prodCert
          return {
            value: `${pordName}`,
            message: "完成",
          };
        },
        "失败"
      );
      // debugProfile
      await this.startStep(
        "accountInfo",
        5,
        async (i) => {
          const profileName = "xiaobai-debug";
          this.agcConfig.debugProfile = await this.createAndDownloadProfile(packageName, profileName, 1)
          return {
            value: `${profileName}`,
            message: "完成",
          };
        },
        "失败"
      );
      await this.startStep(
        "accountInfo",
        6,
        async (i) => {
          const profileName = "xiaobai-prod";
          this.agcConfig.prodProfile = await this.createAndDownloadProfile(packageName, profileName, 2)
          return {
            value: `${profileName}`,
            message: "完成",
          };
        },
        "失败"
      );
    this.dh.writeObjToFile("agc_config.json", this.agcConfig)
    this.running = false;
  }
  
  async startBuild(commonInfo) {}


  async createAndDownloadCert(name, type = 1){
    let result = await this.agc.getCertList();
    let debugCert = result.certList.find(
      (a) => a.certName == name
    );
    if (!debugCert) {
      result = await this.agc.createCert(name, type);
      debugCert = result.harmonyCert;
    }
    console.debug("cert ", debugCert);
    result = await this.agc.downloadObj(debugCert.certObjectId, name + ".cer")
    let urlnfo = result.urlInfo;
    let filePath = this.dh.downloadFile(urlnfo.url, name + ".cer")
   
    return {
      id: debugCert.id,
      name,
      objId: debugCert.certObjectId,
      url: urlnfo.url,
      path: filePath
    }
  }


  async createAndDownloadProfile(packageName, name, type = 1){
      let result = await this.agc.profileList(packageName);
      let profile = result.list.find(
        (a) => a.packageName == packageName && a.provisionType == type
      );
      if (!profile) {
        // debug 需要注册设备
        if(type == 1){
          result = await this.agc.deviceList("xiaobai-device")
          let deviceList = result.list || []
          if (deviceList.length == 0) {
            let device = this.cmd.deviceList()
            if (device.length == 0) {
              throw new Error("请连接手机")
            }
            const udid = await this.cmd.getUdid(null)
       
            await this.agc.createDevice("xiaobai-device", deviceUdid)
            result = await this.agc.deviceList("xiaobai-device")
            console.debug("devicelist", result);
            deviceList = result.list
          }
          result = await this.agc.createProfile(
              name,
              this.agcConfig.debugCert.id,
              this.agcConfig.appId,
              type,
              deviceList.map((d)=>d.id)
          );
        
        } else {
          result = await this.agc.createProfile(
            name,
            this.agcConfig.prodCert.id,
            this.agcConfig.appId,
            type,
          );
        }
        profile = result.provisionInfo;
      }
      console.debug("profile ", profile);
      result = await this.agc.downloadObj(profile.provisionObjectId, name + ".p7b")
      let urlnfo = result.urlInfo;
      let filePath = this.dh.downloadFile(urlnfo.url, name + ".p7b")
      return {
        id: profile.id,
        name: name,
        path: filePath
      }
  }

  async startStep(key, i, callback, error = "") {
    this.updateStep(key, i, { loading: true, value: "", message: "" });
    try {
      let result = await callback(i, key);
      this.finishStep(key, i, result.value, result.message);
      return true;
    } catch (e) {
      console.error(`startStep ${i} error`, e.message || e, e.stack)
      this.failStep(key, i, e, error);
      return false;
    }
  }
  finishStep(key, i, value, message) {
    this.updateStep(key, i, {
      loading: false,
      finish: true,
      value: value,
      message: message,
    });
  }
  failStep(key, i, value, message) {
    this.updateStep(key, i, {
      loading: false,
      finish: false,
      value: value,
      message: message,
    });
  }
  updateStep(key, i, obj) {
    let old = this.core[key].steps[i];
    this.core[key].steps[i] = {
      ...old,
      ...obj,
    };
  }

}

module.exports = {
  BuildService,
};
