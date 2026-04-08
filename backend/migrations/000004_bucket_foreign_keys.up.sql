DELETE site_domains
FROM site_domains
LEFT JOIN sites ON sites.id = site_domains.site_id
WHERE sites.id IS NULL;

DELETE sites
FROM sites
LEFT JOIN buckets ON buckets.name = sites.bucket_name
WHERE buckets.name IS NULL;

DELETE objects
FROM objects
LEFT JOIN buckets ON buckets.name = objects.bucket_name
WHERE buckets.name IS NULL;

ALTER TABLE objects
    ADD CONSTRAINT fk_objects_bucket_name
        FOREIGN KEY (bucket_name) REFERENCES buckets(name)
            ON UPDATE CASCADE
            ON DELETE CASCADE;

ALTER TABLE sites
    ADD CONSTRAINT fk_sites_bucket_name
        FOREIGN KEY (bucket_name) REFERENCES buckets(name)
            ON UPDATE CASCADE
            ON DELETE CASCADE;

ALTER TABLE site_domains
    ADD CONSTRAINT fk_site_domains_site_id
        FOREIGN KEY (site_id) REFERENCES sites(id)
            ON UPDATE CASCADE
            ON DELETE CASCADE;
