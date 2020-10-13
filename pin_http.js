var express = require('express');
var app = express();
var client = undefined;
var db = undefined;

var check_connected = function() {
    return client != undefined && db != undefined;
}
var not_connected = "Discord not connected. Come back later.";

app.set('view engine', 'ejs');

app.get('/:guild/', function(req, res) {
    if (!check_connected()) { return res.send(not_connected); }
    var guild = client.guilds.cache.get(req.params.guild);
    if (!guild) {
        return res.send("cannot find guild");
    }
    res.render('guild.ejs', {guild: guild}, function(err, html) {
        res.send(html);
        if (err) console.error(err);
    });
});

app.get('/:guild/:channel/', function(req, res) {
    if (!check_connected()) { return res.send(not_connected); }
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
        res.render('channel.ejs', {channel: channel, pins: pins}, function(err, html) {
            res.send(html);
            if (err) console.error(err);
        });
    });
});

app.get('/:guild/:channel/:message', function(req, res) {
    if (!check_connected()) { return res.send(not_connected); }
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

        channel.messages.fetch(pin.message).then(function(msg) {
            res.render('pin.ejs', {pin: pin, msg: msg}, function(err, html) {
                res.send(html);
                if (err) console.error(err);
            });
        }).catch(function(e) {
            res.redirect(req.params.message + "/saved");
        });
      }
    });
});

app.get('/:guild/:channel/:message/saved', function(req, res) {
    if (!check_connected()) { return res.send(not_connected); }
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
            res.render('pin_deleted.ejs', {msg_exists: msg_exists, pin: pin, channel:channel, guild:guild}, function(err, html) {
                res.send(html);
                if (err) console.error(err);
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

var server = function(discord_client, db_conn) {
    client = discord_client;
    db = db_conn;
    console.log("discord connected to http");
}

exports = module.exports = {
    server: server
}

app.listen(80, function() {
    console.log("http listening on 80");
});
