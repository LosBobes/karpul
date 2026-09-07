output "ipv4" {
  value       = hcloud_server.app.ipv4_address
  description = "Point your DNS A record at this."
}

output "ipv6" {
  value       = hcloud_server.app.ipv6_address
  description = "Point your DNS AAAA record at this."
}
