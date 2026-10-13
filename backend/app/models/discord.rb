# The Discord shell module (ADR-0010, ADR-0022): the second shell's server
# side — sign-in, the server → map registry, later the bot move. A new module,
# so its tables carry the `discord_` prefix.
module Discord
  def self.table_name_prefix
    "discord_"
  end
end
