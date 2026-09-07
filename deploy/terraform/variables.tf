variable "hcloud_token" {
  description = "Hetzner Cloud API token (Read & Write). Pass via TF_VAR_hcloud_token, never commit it."
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "Public half of the key used by GitHub Actions and you to reach the server."
  type        = string
}

variable "name" {
  description = "Server / resource name prefix."
  type        = string
  default     = "karpul"
}

variable "server_type" {
  description = "Hetzner server type. cx22 (2 vCPU, 4 GB) is plenty for this app."
  type        = string
  default     = "cx22"
}

variable "location" {
  description = "Hetzner location: fsn1, nbg1, hel1, ash, hil, sin."
  type        = string
  default     = "fsn1"
}

variable "ssh_allowed_cidrs" {
  description = "CIDRs allowed to reach SSH. Narrow this to your office/VPN if you can."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}
