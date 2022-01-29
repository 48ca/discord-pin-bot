#!/usr/bin/env node

const Discord = require('discord.js');
const client = new Discord.Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION']});

const fs = require('fs');
const https = require('https');

var process = require('process');

var Sequelize = require('sequelize');
const Op = Sequelize.Op;

const { exec } = require("child_process");

var pin_http = require("./pin_http");

var interval = undefined;

var seq = new Sequelize('sqlite:db.sqlite3');

var BASE_URL = "pins.jhoughton.me";

var generate_otp = function() {
  var otp = "";
  for (var i = 0; i < 4; ++i) {
    otp += String.fromCharCode(65 + Math.random() * 26);
  }
  return otp;
}

var emoji_name = "like";

var Alias = seq.define('alias', {
  guild: { type: Sequelize.STRING },
  shortname: { type: Sequelize.STRING },
});

var Pin = seq.define('pin', {
  guild: { type: Sequelize.STRING },
  channel: { type: Sequelize.STRING },
  pinner: { type: Sequelize.STRING },
  author: { type: Sequelize.STRING },
  pinner_name: { type: Sequelize.STRING },
  author_name: { type: Sequelize.STRING },
  message: { type: Sequelize.STRING },
  content: { type: Sequelize.STRING }
});

var Tag = seq.define('tag', {
  text: { type: Sequelize.STRING }
}, { timestamps: false });

Pin.hasMany(Tag);

var otps = {};
var otps_clientids = {};

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  pin_http.server(client, Pin, Alias, Tag, otps_clientids);
});

Pin.sync().then(function() {
  console.log("Table created");
});

Alias.sync().then(function() {
  console.log("Alias table created");
});

Tag.sync().then(function() {
  console.log("Tag table created");
});
var handled_archive = function(orig_message, backup) {
  var emoji_id = client.emojis.cache.find(emoji => emoji.name == "PepeNote");
  if (!emoji_id) {
    channel.send(backup);
  } else {
    orig_message.react(emoji_id).catch(function(e) {
      channel.send(backup);
      console.log("Could not react: " + e);
    });
  }
}
var handled = function(orig_message, backup) {
  var emoji_id = client.emojis.cache.find(emoji => emoji.name == emoji_name);
  if (!emoji_id) {
    channel.send(backup);
  } else {
    orig_message.react(emoji_id).catch(function(e) {
      channel.send(backup);
      console.log("Could not react: " + e);
    });
  }
}

var tag = function(orig_message, tag_id, tag_cmd, tag_str) {
  var channel = orig_message.channel;
  var guild = orig_message.channel.guild;
  Pin.findOne({
    where: {
      guild: guild.id,
      channel: channel.id,
      message: tag_id
    }
  }).then(function(pin) {
    if (!pin) {
      channel.send("Could not find pin for message " + tag_id);
      return;
    } else {
      if (tag_cmd == "add") {
        if (!tag_str) {
          channel.send("Please specify a tag");
          return;
        }
        Tag.findOne({
          where: {
            text: tag_str,
            pinId: pin.id,
          }
        }).then(function(tag) {
          if (tag) {
            channel.send("Tag already exists for this pin");
            return;
          }
          Tag.create({
            text: tag_str,
            pinId: pin.id,
          }).then(async function() {
            handled(orig_message, "Tag added: " + tag_str);
          });
        });
        return;
      } else if (tag_cmd == "delete") {
        if (!tag_str) {
          channel.send("Please specify a tag");
          return;
        }
        Tag.findOne({
          where: {
            text: tag_str,
            pinId: pin.id,
          }
        }).then(function(tag) {
          if (!tag) {
            channel.send("Tag does not exist for this pin");
            return;
          }
          tag.destroy();
          handled(orig_message, "Tag deleted");
        });
        return;
      } else if (!tag_cmd || tag_cmd == "list") {
        Tag.findAll({
          where: {
            pinId: pin.id,
          }
        }).then(function(tags) {
          if (!tags) {
            channel.send("No tags for this pin");
            return;
          }
          var str = "Tags:";
          tags.forEach(function(tag) {
            str += " " + tag.text;
          });
          channel.send(str);
          return;
        });
      } else {
        channel.send("Please use `tag add/delete/list`");
        return;
      }
    }
  });
}

var deletePin = function(orig_message, guild, channel, pinner, desired_message_id) {
  Pin.findOne({
    where: {
      guild: guild.id,
      channel: channel.id,
      message: desired_message_id
    }
  }).then(function(row) {
    if (!row) {
      channel.send("Pin does not exist");
      return;
    }
    row.destroy();
    handled(orig_message, "Unpinned " + desired_message_id);
  });
};

var pin = function(orig_message, guild, channel, pinner, desired_message_id) {
  channel.messages.fetch(desired_message_id).then(function(message) {
    Pin.findOne({
      where: {
        guild: guild.id,
        channel: channel.id,
        message: message.id
      }
    }).then(function(exists) {
      if (exists) { 
        channel.send("Already pinned http://" + BASE_URL + "/" + guild.id + "/" + channel.id + "/" + message.id);
        return;
      }
      Pin.create({
        guild: guild.id,
        channel: channel.id,
        pinner: pinner.id,
        author: message.author.id,
        author_name: message.author.username,
        pinner_name: pinner.username,
        content: message.content,
        message: message.id
      }).then(async function(pin) {
        handled(orig_message, "Pinned http://" + BASE_URL + "/" + guild.id + "/" + channel.id + "/" + message.id);
        await archive(pin);
        handled_archive(orig_message, "Pin archived");
      });
    });
  }).catch(function(e) {
    channel.send("Couldn't pin: `" + desired_message_id + "`");
  });
}

client.on('messageReactionAdd', async (reaction, user) => {
  // source: https://discordjs.guide/popular-topics/reactions.html#listening-for-reactions-on-old-messages
  // When a reaction is received, check if the structure is partial
  if (reaction.partial) {
    // If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Something went wrong when fetching the message:', error);
      // Return as `reaction.message.author` may be undefined/null
      return;
    }
  }

  if(reaction.emoji.name === 'pin') {
    pin(reaction.message, reaction.message.channel.guild, reaction.message.channel, user, reaction.message.id);
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
    // source: https://discordjs.guide/popular-topics/reactions.html#listening-for-reactions-on-old-messages
    // When a reaction is received, check if the structure is partial
    if (reaction.partial) {
      // If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('Something went wrong when fetching the message:', error);
        // Return as `reaction.message.author` may be undefined/null
        return;
      }
    }
      
    if(reaction.emoji.name === 'pin') {
        deletePin(reaction.message, reaction.message.channel.guild, reaction.message.channel, user, reaction.message.id);
    }
  });

client.on("message", async message => {
  if(message.channel.type == 'dm') {
    return;
  }
  var lower = message.content.toLowerCase();
  var match_res = lower.match(/^!?((?:un)?pin)(?: ([0-9]+|link|otp|list|alias (.*$)|tag(?:(?: ([0-9]+))? ([^ ]+)(?: (.+))?)))?$/);
  if (!match_res) {
    // ignored
    return;
  }
  var cmd = match_res[1];
  var arg = match_res[2];
  var desired_alias = match_res[3];
  var tag_id = match_res[4];
  var tag_cmd = match_res[5];
  var tag_str = match_res[6];
  if (cmd == "unpin" && arg) {
    return deletePin(message, message.channel.guild, message.channel, message.author, arg);
  }
  else if (cmd == "pin") {
    if (arg == "link") {
      Pin.findOne({
        order: [ ['createdAt', 'DESC' ] ],
      }).then(function(entry) {
        if (entry) {
          var last_pin = entry.message;
          message.channel.send("Last pin: http://" + BASE_URL + "/" + message.channel.guild.id + "/" + message.channel.id + "/" + last_pin);
        } else {
          message.channel.send("No pins");
        }
      });
      return;
    }
    if (arg == "otp") {
      var id = message.author.id;
      var otp = generate_otp();
      var obj = { otp: otp, guild: message.channel.guild.id, client: id };
      otps[id] = obj;
      otps_clientids[otp] = obj;
      setTimeout(function() {
        delete otps[id];
        delete otps_clientids[otp];
      }, 30000);
      message.author.send(`OTP: ${otp} (valid for 30s)`);
      setTimeout(function() {
        message.delete();
      }, 1000);
      return;
    }
    if (arg == "list") {
      message.channel.send("Pins can be found here: http://" + BASE_URL + "/" + message.channel.guild.id + "/" + message.channel.id + "/");
      return;
    }
    else if (arg && arg.startsWith("alias")) {
      Alias.findOne({
        where: { [Op.or]: [
          { guild: message.channel.guild.id },
          { shortname: desired_alias }
        ]}
      }).then(function(alias_row) {
        if (alias_row) {
          message.channel.send("Alias already exists for this server or the alias is taken.");
        } else {
          Alias.create({
            guild: message.channel.guild.id,
            shortname: desired_alias
          }).then(function() {
            message.channel.send("Alias created");
          });
        }
      }).catch(function(e) {
        console.log("Error executing query: " + e);
      });
      return;
    }
    else if (arg && arg.startsWith("tag")) {
      if (!tag_id) {
        Pin.findOne({
          order: [ ['createdAt', 'DESC' ] ],
        }).then(function(entry) {
          if (entry) {
            tag(message, "" + entry.message, tag_cmd, tag_str);
          } else {
            message.channel.send("No pins");
          }
        });
      } else {
        tag(message, tag_id, tag_cmd, tag_str);
      }
      return;
    }
    else if (arg) {
      pin(message, message.channel.guild, message.channel, message.author, arg);
    } else {
      message.channel.messages.fetch({ limit: 2 }).then(function(messages) {
        for (let msg of messages.values()) {
          if (msg.id != message.id) {
            if (msg.content != "pin") {
              pin(message, message.channel.guild, message.channel, message.author, msg.id);
            }
            break;
          }
        }
      });
      return;
    }
  }
});

client.on('shardError', function(e) {
  console.error('Got shardError: ' + e);
});

client.on('error', function(e) { console.log(e); });

process.on('unhandledRejection', function(e) {
  console.error('Unhandled rejection: ' + e);
});

if (!process.env.BOT) {
  console.error("Give bot token as BOT env var please");
  process.exit(1);
}

client.login(process.env.BOT).catch(function(e) {
  console.error('Caught error ' + e);
}).then(function(e) {
  console.log(e);
});

console.log("Sent login request");

var archive = async function(pin) {
  var guild_id = pin.guild;
  var channel_id = pin.channel;
  var message_id = pin.message;
  var dir = `archive/${guild_id}/${channel_id}/${message_id}`;
  console.log("Archiving " + dir);
  fs.mkdirSync(dir, { recursive: true });
  console.log(pin.id, pin.pinner_name, guild_id, channel_id, message_id);

  fs.writeFile(`${dir}/raw.json`, JSON.stringify(pin, null, 4), function(err) {
    if (err) {
      console.log("Error writing raw.json for pin", pin.id, err);
    }
  });

  var guild = client.guilds.cache.get(guild_id);
  if (!guild) {
    console.warn("Could not find guild:", guild_id);
    return;
  }

  var pinner_user = await guild.members.fetch(pin.pinner).catch(function (err) {
    console.warn("Unknown user:", pin.pinner, err);
  });
  if (pinner_user) {
    fs.writeFile(`${dir}/pinner.json`, JSON.stringify(pinner_user.user, null, 4), function(err) {
      if (err) {
        console.warn("Failed writing pinner.json", message_id, err);
      }
    });
  }
  var author_user = await guild.members.fetch(pin.author).catch(function (err) {
    console.warn("Unknown user:", pin.author, err);
  });
  if (author_user) {
    fs.writeFile(`${dir}/author.json`, JSON.stringify(author_user.user, null, 4), function(err) {
      if (err) {
        console.log("Error writing author.json for pin", pin.id, err);
      }
    });
  }

  var channel = guild.channels.cache.get(channel_id);
  if (!channel) {
    console.warn("Could not find channel:", channel_id);
    return;
  }

  var message = await channel.messages.fetch(message_id).catch(function(err) {
    console.warn("Could not find message:", message_id);
  });
  if (!message) {
    fs.writeFile(`${dir}/DELETED`, "", function(err) { if (err) { console.log("Error writing DELETED file: ", err); }});
    return;
  }
  fs.writeFile(`${dir}/content.txt`, message.content, function(err) {
    if (err) {
      console.warn("Failed writing content.txt", message_id, err);
    }
  });
  if (message.attachments.size > 0) {
    var a_dir = `${dir}/attachments`;
    fs.mkdirSync(a_dir, { recursive: true });
    for (let a of message.attachments.values()) {
      let fn = a.name;
      var real_fn = `${a_dir}/${fn}`;
      var file = fs.createWriteStream(real_fn);
      var prom = new Promise(function(resolve, reject) {
        var req = https.get(a.url, function(resp) {
          resp.pipe(file);
          file.on('finish', function() {
            file.close(function() {
              console.log("Finished writing attachment:", message_id, fn);
            });
            resolve();
          });
        }).on('error', function(err) {
          fs.unlink(real_fn);
          console.log("Failed to write attachment:", message_id, fn);
          reject();
        });
      });
      await prom;
    }
  }
};

// vim: et ts=2 sw=2
