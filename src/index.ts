const command = process.argv[2] ?? 'build';

switch (command) {
  case 'build':
    console.log('[food-assembler] build pipeline not implemented yet (see docs/IMPLEMENTATION_PLAN.md)');
    break;
  case 'crawl':
    console.log('[food-assembler] single-restaurant crawl not implemented yet');
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
