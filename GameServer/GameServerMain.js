var tcp = require("../LighterWebEngine/TCP");
var cfg = require("../Common/Config");

// 服务器的描述
var G_GameServer = {
    UUID:0
};

// 连接大厅
var G_HallSocket = tcp.CreateClient(cfg.HallServerPort, cfg.HallServerIP,
    function () {
        console.log("游戏服连接大厅服成功!");

        // 请求大厅注册
        var sPacket = {
            MM: "RegGameServer"
        };
        tcp.SendBuffer(G_HallSocket, JSON.stringify(sPacket));
    },

    function (sBuffer) {
        var oPacket = JSON.parse(sBuffer);
        switch(oPacket.MM) {
            case "RegGameServer":
                G_GameServer.UUID = oPacket.UUID;
                break;
            case "EnterGame":
                Msg_EnterGame(oPacket);
                break;
        }
    }
);

//////////////////////////////////////////////////////////////////////////
// 游戏房间管理

// 房间管理
var Pool_Room = {}; //Key: RoomID Value: CRoom
var Pool_UUID_ROOM = {}; // Key: 玩家UUID Value: RoomID

// 网关连接管理
var Pool_GW = {}; // Key: 网关UUID Value: Socket

// 消息处理
function Msg_EnterGame(oPacket) {
    Pool_Room[oPacket.Room.RoomID] = oPacket.Room;
    console.log("房间数量:" + Object.keys(Pool_Room).length + " 新加入房间ID:" + oPacket.Room.RoomID);

    for (var iUUID in oPacket.Room.ClientArr) {
        Pool_UUID_ROOM[iUUID] = oPacket.Room.RoomID;
    }

    for (var i in oPacket.WS) {
        var iter = oPacket.WS[i];

        //判断是否连接了重复的网关
        if (iter.UUID in Pool_GW) {
            //通知网关.更改该UUID的玩家.与Hall断开路由.转而与本游戏服路由.
            var sPacket = {};
            sPacket.MM = "RouteToGameServer";
            sPacket.Room = oPacket.Room;
            tcp.SendBuffer(Pool_GW[iter.UUID], JSON.stringify(sPacket));
            continue;
        }

        var hSocket = tcp.CreateClient(iter.Port, iter.IP,
            function () {

            },
            ClientMsgProcess
        );

        hSocket.UUID = iter.UUID;
        hSocket.Port = iter.Port;
        hSocket.IP = iter.IP;
        hSocket.Room = oPacket.Room;

        console.log("连接网关 Port:" + hSocket.Port + " IP:" + hSocket.IP + " UUID:" + hSocket.UUID);
        Pool_GW[hSocket.UUID] = hSocket;

        //通知网关.更改该UUID的玩家.与Hall断开路由.转而与本游戏服路由.
        var sPacket = {};
        sPacket.MM = "RouteToGameServer";
        sPacket.Room = hSocket.Room;
        tcp.SendBuffer(hSocket, JSON.stringify(sPacket));
    }
};

function PlayerUUIDGetGateWayUUID(iUUID){
    var iGWUUID = iUUID % cfg.GateWayServerPlayerIDRule;
    return iGWUUID;
};

function GS_SendBuffer(iUUID, sBuffer) {
    tcp.SendBuffer(Pool_GW[PlayerUUIDGetGateWayUUID(iUUID)], sBuffer);
};

function ClientMsgProcess(sBuffer) {
    var oPacket = JSON.parse(sBuffer);
    switch(oPacket.MM) {
        case "LeaveGame":
            var sPacket = {
                MM : "LeaveGame",
                UUID : oPacket.UUID
            };
            GS_SendBuffer(oPacket.UUID, JSON.stringify(sPacket));

            console.log("玩家离开游戏房间:" + oPacket.UUID);

            //处理Room. 如果玩家都离线了. 则删除房子.并通知大厅.更新 GS的房子数数据
            var roomID = Pool_UUID_ROOM[oPacket.UUID];
            if (roomID in Pool_Room){
                var room = Pool_Room[roomID];
                if (oPacket.UUID in room.ClientArr) {
                    delete room.ClientArr[oPacket.UUID];
                    if(Object.keys(room.ClientArr) <= 0) {
                        delete Pool_Room[roomID];
                        var sPacket = {
                            MM:"GS_RemoveRoom",
                            RoomID:roomID,
                            GSID:G_GameServer.UUID
                        };
                        tcp.SendBuffer(G_HallSocket,JSON.stringify(sPacket));
                    }
                }
            }
            break;
        case "C_AllBallSys":
            var iUUID = oPacket.UUID;
            var roomID = Pool_UUID_ROOM[iUUID];

            if(roomID in Pool_Room) {
                var room = Pool_Room[roomID];

                for (var iMemberUUID in room.ClientArr) {
                    if(iUUID != iMemberUUID){
                        oPacket.UUID = iMemberUUID;
                        GS_SendBuffer(iMemberUUID, JSON.stringify(oPacket));
                    }
                }
            }
            break;
    }
};

