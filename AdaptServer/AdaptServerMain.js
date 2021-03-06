var cfg = require("../Common/Config");
var util = require("../Common/TSUtil");
var uuid = require("../LighterWebEngine/UUID");
var tcp = require("../LighterWebEngine/TCP");
var ws = require('../LighterWebEngine/WebSocket');

// 网关池.用来分析.玩家与哪个网关相连
var Pool_GateWay = [];
function CGateWay(Port, IP, Socket) {
    this.Port = Port;
    this.IP = IP;
    this.Socket = Socket;
    this.Number = 0;
};

// 启动适配服
tcp.CreateServer(cfg.AdaptServerPort,
    function() {
        console.log("Timeshift AdaptTCPServer Success!");
    },

    function(hSocket, sBuffer) {
        var oPacket = JSON.parse(sBuffer);
        switch (oPacket.MM) {
            case "GW_GetUuidPort":  //网关启动获取UUID和动态Port
                GateWay_GetUUID(hSocket);
                break;
            case "GW_RegGateWay":   //通过分配的Port启动网关之后的回馈.注册网关
                GateWay_RegGateWay(hSocket, oPacket);
                break;
            case "HS_ConnectHall":  //大厅重启的时候.通过该消息重连
                Hall_ConnectHall();
                break;
        };
    },

    function(hSocket) {
        var UID = uuid.G_GetUUID(hSocket);
        uuid.G_RemoveS(hSocket);
        var iPort = 0;

        for (var i = 0 ; i < Pool_GateWay.length ; i++) {
            if (Pool_GateWay[i].Socket === hSocket) {
                iPort = Pool_GateWay[i].Port;
                Pool_GateWay.splice(i,1);
                break;
            }
        }
        console.log("服务器关闭 UUID = " + UID + " 如果是网关断开的端口 = " + iPort + " 目前AS上网关数量 = " + Pool_GateWay.length);
    },

    function(hSocket) {
        var iUUID = uuid.G_UUID();
        hSocket.UUID = iUUID;
    }
);

function GateWay_GetUUID(hSocket){
    var iUUID = hSocket.UUID;
    var iPORT = uuid.G_PORT() + cfg.GateWayServerPort_WS;
    hSocket.PORT= iPORT;

    var sPacket = {};
    sPacket["MM"] = "GW_GetUuidPort";
    sPacket["UUID"] = iUUID;
    sPacket["PORT"] = iPORT;
    tcp.SendBuffer(hSocket, JSON.stringify(sPacket));

    uuid.G_SetSU(hSocket, iUUID);
};

function GateWay_RegGateWay(hSocket, oPacket) {
    var GW = new CGateWay(oPacket.Port, oPacket.IP, hSocket);
    Pool_GateWay.push(GW);

    console.log("GateWay Regist Success! Port:" + oPacket.Port + " IP:" + oPacket.IP );
};

function Hall_ConnectHall() {
    for (var i = 0 ; i < Pool_GateWay.length ; i++) {
        var GW = Pool_GateWay[i];

        var sPacket = {
            MM:"HS_ConnectHall"
        };
        tcp.SendBuffer(GW.Socket, JSON.stringify(sPacket));
    }
};

//////////////////////////////////////////////
//ws服务器流程: 决定登陆的客户端连接哪个网关
var G_ClientNumber = 0;

ws.CreateServer(cfg.AdaptServerPort_WS,
    function () {
        console.log("Timeshift AdaptWebSocketServer Success!");
    },

    function (hSocket, sBuffer) {
        var oPacket = JSON.parse(sBuffer);
        switch(oPacket.MM) {
            case "ConnectGateWay":
                if(Pool_GateWay.length <= 0){
                    console.log("当前没有网关开启!");
                    return;
                }

                var index = (G_ClientNumber - 1) % Pool_GateWay.length;
                var GW = Pool_GateWay[index];

                var sPacket = {};
                sPacket.MM = "ConnectGateWay";
                sPacket.IP = GW.IP;
                sPacket.Port = GW.Port;
                ws.SendBuffer(hSocket, JSON.stringify(sPacket));
                break;
        }
    },

    function (hSocket) {

    },

    function (hSocket) {
        G_ClientNumber ++;
    }
);

