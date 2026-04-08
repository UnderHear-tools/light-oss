ALTER TABLE site_domains
    DROP FOREIGN KEY fk_site_domains_site_id;

ALTER TABLE sites
    DROP FOREIGN KEY fk_sites_bucket_name;

ALTER TABLE objects
    DROP FOREIGN KEY fk_objects_bucket_name;
