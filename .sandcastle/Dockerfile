FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack (bundled with node:22). Pinned to match the
# packageManager field in package.json; cached in the image so the sandbox
# doesn't fetch it at runtime.
RUN corepack enable && corepack prepare pnpm@11.5.0 --activate

# Build-args for UID/GID alignment: sandcastle docker build-image
# defaults these to the host user's UID/GID so image-built files
# and bind-mounted files share an owner without runtime chown.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Rename the base image's "node" user to "agent" and align UID/GID.
RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

# Install Claude Code CLI. Download to a file first instead of `curl | bash`:
# if curl can't reach the server, the pipe would feed empty input to bash,
# which exits 0 and silently ships an image with no Claude. With `-o` + `&&`
# a network failure fails the build loudly.
RUN curl -fsSL https://claude.ai/install.sh -o /tmp/install.sh \
  && bash /tmp/install.sh \
  && rm /tmp/install.sh

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:$PATH"

# Fail the build if Claude didn't actually land on PATH.
RUN claude --version

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
