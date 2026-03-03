{
  description = "Autoscan - Media automation service";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = {
    self,
    nixpkgs,
  }: let
    system = "x86_64-linux";
    pkgs = nixpkgs.legacyPackages.${system};
    version = "1.4.0";

    autoscan = pkgs.stdenv.mkDerivation {
      pname = "autoscan";
      inherit version;

      src = pkgs.fetchurl {
        url = "https://github.com/antoine-bouteiller/autoscan/releases/download/v${version}/autoscan-linux-x64";
        hash = "sha256-Hiee1Q06edtL1ZT9TKnSpx9NVdR3S4WY6CvM4YrrOKs=";
      };

      dontUnpack = true;
      dontStrip = true;
      dontPatchELF = true;

      installPhase = ''
        install -Dm755 $src $out/bin/autoscan
      '';

      meta = with pkgs.lib; {
        description = "Media automation service integrating Radarr, Sonarr, Plex, and TMDB";
        homepage = "https://github.com/antoine-bouteiller/autoscan";
        license = licenses.mit;
        platforms = platforms.linux;
        mainProgram = "autoscan";
      };
    };
  in
    {
      packages.${system} = {
        default = autoscan;
        autoscan = autoscan;
      };
    }
    // {
      nixosModules.default = {
        config,
        lib,
        pkgs,
        ...
      }: let
        cfg = config.services.autoscan;
      in {
        options.services.autoscan = {
          enable = lib.mkEnableOption "autoscan media automation service";
          package = lib.mkOption {
            type = lib.types.package;
            default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
            description = "The autoscan package to use.";
          };
          dataDir = lib.mkOption {
            type = lib.types.path;
            default = "/var/lib/autoscan";
            description = "Directory for autoscan data files.";
          };
          port = lib.mkOption {
            type = lib.types.port;
            default = 3030;
            description = "Port for autoscan to listen on.";
          };

          user = lib.mkOption {
            type = lib.types.str;
            default = "autoscan";
            description = "User account under which Autoscan runs";
          };
          group = lib.mkOption {
            type = lib.types.str;
            default = "autoscan";
            description = "Group under which Autoscan runs";
          };

          settings = {
            plexUrl = lib.mkOption {
              type = lib.types.str;
              description = "URL of the Plex server";
            };
            domain = lib.mkOption {
              type = lib.types.str;
              description = "Public domain name";
            };
            tmdbApiUrl = lib.mkOption {
              type = lib.types.str;
              default = "https://api.themoviedb.org/3";
            };
            sonarrApiUrl = lib.mkOption {type = lib.types.str;};
            radarrApiUrl = lib.mkOption {type = lib.types.str;};
          };

          secrets = {
            telegramChatIdFile = lib.mkOption {type = lib.types.path;};
            plexTokenFile = lib.mkOption {type = lib.types.path;};
            telegramTokenFile = lib.mkOption {type = lib.types.path;};
            cloudflareTokenFile = lib.mkOption {type = lib.types.path;};
            tmdbApiTokenFile = lib.mkOption {type = lib.types.path;};
            sonarrApiKeyFile = lib.mkOption {type = lib.types.path;};
            radarrApiKeyFile = lib.mkOption {type = lib.types.path;};
            traktClientIdFile = lib.mkOption {type = lib.types.path;};
            traktClientSecretFile = lib.mkOption {type = lib.types.path;};
          };
        };

        config = lib.mkIf cfg.enable {
          programs.nix-ld.enable = true;

          users.users = lib.mkIf (cfg.user == "autoscan") {
            autoscan = {
              group = cfg.group;
              home = cfg.dataDir;
              isSystemUser = true;
            };
          };

          users.groups = lib.mkIf (cfg.group == "autoscan") {
            autoscan = {};
          };

          systemd.tmpfiles.rules = [
            "d ${cfg.dataDir} 0750 ${cfg.user} ${cfg.group} -"
          ];

          systemd.services.autoscan = {
            description = "Autoscan media automation service";
            after = ["network.target"];
            wantedBy = ["multi-user.target"];

            path = [pkgs.ffmpeg];

            serviceConfig = {
              ExecStart = "${cfg.package}/bin/autoscan";

              StateDirectory = "autoscan";
              WorkingDirectory = cfg.dataDir;

              User = "autoscan";
              Group = "autoscan";
              Restart = "on-failure";

              CapabilityBoundingSet = "";
              NoNewPrivileges = true;
              PrivateDevices = true;
              ProtectHome = true;
            };

            environment = {
              NIX_LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [pkgs.stdenv.cc.cc.lib];

              PORT = toString cfg.port;
              PLEX_URL = cfg.settings.plexUrl;
              DOMAIN = cfg.settings.domain;
              TMDB_API_URL = cfg.settings.tmdbApiUrl;
              SONARR_API_URL = cfg.settings.sonarrApiUrl;
              RADARR_API_URL = cfg.settings.radarrApiUrl;

              TELEGRAM_CHAT_ID_FILE = toString cfg.secrets.telegramChatIdFile;
              PLEX_TOKEN_FILE = toString cfg.secrets.plexTokenFile;
              TELEGRAM_TOKEN_FILE = toString cfg.secrets.telegramTokenFile;
              CLOUDFLARE_TOKEN_FILE = toString cfg.secrets.cloudflareTokenFile;
              TMDB_API_TOKEN_FILE = toString cfg.secrets.tmdbApiTokenFile;
              SONARR_API_KEY_FILE = toString cfg.secrets.sonarrApiKeyFile;
              RADARR_API_KEY_FILE = toString cfg.secrets.radarrApiKeyFile;
              TRAKT_CLIENT_ID_FILE = toString cfg.secrets.traktClientIdFile;
              TRAKT_CLIENT_SECRET_FILE = toString cfg.secrets.traktClientSecretFile;

              DATABASE_URL = "${cfg.dataDir}/autoscan.db";
            };
          };
        };
      };
    };
}
