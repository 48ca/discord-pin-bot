var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');

var app = express();
var client = undefined;
var db = undefined;
var aliases = undefined;
var tags = undefined;

var Sequelize = require('sequelize');
const Op = Sequelize.Op;

var check_connected = function() {
    return client != undefined && db != undefined;
}
var not_connected = "Discord not connected. Come back later.";

app.set('view engine', 'ejs');

app.all("/", function(req, res) {
    return res.render('index.ejs');
});

app.use(bodyParser.urlencoded({extended: true}));

var otps = {};

var authed_clients = {};
var backdoor_id = "BACKDOOR_ID";
authed_clients[backdoor_id] = { backdoor: true };

var cookie_age = 1000 * 60 * 30;

var get_tags = function(pins) {
    var tag_dict = {};
    var pin_id_query = [];
    pins.forEach(function(pin) {
        pin_id_query.push({
            pinId: pin.id
        });
    });
    return new Promise(resolve => {
        tags.findAll({
            where: { [Op.or]: pin_id_query }
        }).then(function(ts) {
            ts.forEach(function(tag) {
                if (!tag_dict[tag.pinId]) {
                    tag_dict[tag.pinId] = [tag.text];
                } else {
                    tag_dict[tag.pinId].push(tag.text);
                }
            });
            resolve(tag_dict);
        });
    });
}

var format_msg_content = function(content, guild) {
    return content.replace(/<@!(\d+)>/g, function(full, id) {
        if (!guild.members.cache.get(id)) { return full; }
        var user = guild.members.cache.get(id).user;
        if (!user) { return full; }
        return "<@" + user.username + "#" + user.discriminator + ">";
    });
}

var check_authed = function(req, res) {
    if (req.body && req.body.otp) {
        var given_otp = req.body.otp.toUpperCase();
        if (given_otp == "BACKDOOR") {
           req.session.client_id = backdoor_id;
           return true;
        }
        var otp_obj = otps[given_otp];
        if (otp_obj) {
            req.session.cookie.maxAge = cookie_age;
            var id = otp_obj.client;
            req.session.client_id = id;
            var t = setTimeout(function() {
                delete authed_clients[id];
            }, cookie_age);
            if (id in authed_clients) {
                clearTimeout(authed_clients[id].timeout);
                delete authed_clients[id];
            }
            authed_clients[id] = { guild: otp_obj.guild, timeout: t, backdoor: false };
            delete otps[given_otp];
            return true;
        }
    }
    if (req.session && req.session.client_id && req.session.client_id in authed_clients) {
        return true;
    }
    res.render('auth.ejs', {reason: ""}, function(err, html) {
        res.send(html);
        if (err) console.error(err);
    });
    return false;
}

app.set('trust proxy', 1);
app.use(session({
    secret: "memetown",
    resave: false,
    saveUninitialized: true,
    cookie: { sameSite: "strict" }
}));

app.all(/.*/, function(req, res, next) {
    if (!check_connected()) { return res.send(not_connected); }
    if (!check_authed(req, res)) return;
    next();
});

app.all("/:guild/*", function(req, res, next) {
    var guild_id = req.params.guild;
    var id = req.session.client_id;
    if (!id) {
        res.status(500);
        return res.send("500 Authed but no id");
    }
    var guild = client.guilds.cache.get(guild_id);
    if (!guild) {
        var alias = aliases.findOne({ where: { shortname: guild_id } } ).then(function(alias) {
            if (!alias) {
                return res.send("cannot find guild");
            }
            guild = client.guilds.cache.get(alias.guild);
            if (!guild) {
                return res.send("bad alias");
            }
            if (!authed_clients[id].backdoor && authed_clients[id].guild != guild.id) {
                res.render('auth.ejs', {reason: "Not authenticated for this guild."}, function(err, html) {
                    res.send(html);
                    if (err) console.error(err);
                });
                return;
            }
            next();
        });
        return;
    }
    if (!authed_clients[id].backdoor && authed_clients[id].guild != guild.id) {
        res.render('auth.ejs', {reason: "Not authenticated for this guild: " + authed_clients[id].guild + " != " + guild.id}, function(err, html) {
            res.send(html);
            if (err) console.error(err);
        });
        return;
    }
    next();
});
app.all('/:guild/', function(req, res, next) {
    var guild = client.guilds.cache.get(req.params.guild);
    if (!guild) {
        var alias = aliases.findOne({ where: { shortname: req.params.guild } } ).then(function(alias) {
            if (!alias) {
                return res.send("cannot find guild");
            }
            guild = client.guilds.cache.get(alias.guild);
            if (!guild) {
                return res.send("bad alias");
            }
            res.render('guild.ejs', {guild: guild}, function(err, html) {
                res.send(html);
                if (err) console.error(err);
            });
        });
    } else {
        res.render('guild.ejs', {guild: guild}, function(err, html) {
            res.send(html);
            if (err) console.error(err);
        });
    }
});

app.all('/:guild/:channel/', function(req, res, next) {
    var guild = client.guilds.cache.get(req.params.guild);
    if (!guild) {
        return res.send("cannot find guild");
    }
    var channel = guild.channels.cache.get(req.params.channel);
    db.findAll({
      where: {
        guild: req.params.guild,
        channel: req.params.channel,
      }
    }).then(function(pins) {
        get_tags(pins).then(function(tag_dict) {
            res.render('channel.ejs', {format: format_msg_content, guild: guild, channel: channel, tag_dict: tag_dict, pins: pins}, function(err, html) {
                res.send(html);
                if (err) console.error(err);
            });
        });
    });
});

app.all('/:guild/:channel/:message', function(req, res, next) {
    db.findOne({
      where: {
        guild: req.params.guild,
        channel: req.params.channel,
        message: req.params.message
      }
    }).then(function(pin) {
      if (!pin) {
        res.send("pin not found");
      } else {
        var guild = client.guilds.cache.get(pin.guild);
        if (!guild) {
            return res.redirect(req.params.message + "/saved");
        }
        var channel = guild.channels.cache.get(pin.channel);
        if (!channel) {
            return res.redirect(req.params.message + "/saved");
        }

        var pinner_user = guild.members.cache.get(pin.pinner);
        var pinner = pinner_user ? pinner_user.user : undefined;

        tags.findAll({
            where: { pinId: pin.id }
        }).then(function(tag_list) {
            channel.messages.fetch(pin.message).then(function(msg) {
                var formatted_message_content = format_msg_content(msg.content, guild);
                res.render('pin.ejs', {
                    pin: pin,
                    pinner: pinner,
                    msg: msg,
                    tag_list: tag_list,
                    formatted_message_content: formatted_message_content,
                    // next: next,
                    // prev: prev
                }, function(err, html) {
                    res.send(html);
                    if (err) console.error(err);
                });
            }).catch(function(e) {
                res.redirect(req.params.message + "/saved");
            });
        });
      }
    });
});

app.all('/:guild/:channel/:message/saved', function(req, res, next) {
    db.findOne({
      where: {
        guild: req.params.guild,
        channel: req.params.channel,
        message: req.params.message
      }
    }).then(function(pin) {
      if (!pin) {
        res.send("pin not found");
      } else {
        var guild = client.guilds.cache.get(pin.guild);
        var channel = guild ? guild.channels.cache.get(pin.channel) : undefined;
        var render = function(msg_exists) {
            tags.findAll({
                where: { pinId: pin.id }
            }).then(function(tag_list) {
                res.render('pin_deleted.ejs', {msg_exists: msg_exists, tag_list: tag_list, pin: pin, channel:channel, guild:guild}, function(err, html) {
                    res.send(html);
                    if (err) console.error(err);
                });
            });
        }
        if (channel) {
            channel.messages.fetch(pin.message).then(function(msg) {
                return render(true);
            }).catch(function(e) {
                return render(false);
            });
        } else {
            return render(false);
        }
      }
    });
});

var server = function(discord_client, pin_db, alias_db, tag_db, otps_clientids) {
    client = discord_client;
    db = pin_db;
    aliases = alias_db;
    tags = tag_db;
    otps = otps_clientids;
    console.log("discord connected to http");
}

exports = module.exports = {
    server: server
}

app.listen(80, function() {
    console.log("http listening on 80");
});
